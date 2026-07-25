param(
    [Parameter(Mandatory=$true)]
    [string]$TargetDir
)

<#
.SYNOPSIS
    Initializes the codewiser multi-agent framework in a target directory.
.DESCRIPTION
    Downloads shared skills, specs, and creates agent-specific configs
    (OpenCode, Claude Code, Cursor, Antigravity, Kilo Code).
    Requires PowerShell 5+ and Git.
.NOTES
    If you see "running scripts is disabled", run:
      Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
    If symlinks fail, enable Developer Mode or run as Administrator.
#>

# Enable TLS 1.2 for GitHub downloads (disabled by default on many Windows builds)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RAW_BASE = "https://raw.githubusercontent.com/yallma3/codewiser/main"

$resolvedDir = Resolve-Path $TargetDir -ErrorAction SilentlyContinue
if ($resolvedDir) {
    $TargetDir = $resolvedDir
} else {
    $TargetDir = [System.IO.Path]::GetFullPath($TargetDir)
}
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

Write-Host ">> Setting up codewiser in $TargetDir..."

# --- Agent Selection (checkbox-style) ---
$choices = @("OpenCode / MiMo / Crush", "Claude Code", "Cursor", "Antigravity", "Kilo Code")
$selections = @($false, $false, $false, $false, $false)

Write-Host ""
Write-Host "Select AI agents (enter number to toggle, 'd' when done):"

$agentDone = $false
while (-not $agentDone) {
    for ($i = 0; $i -lt $choices.Length; $i++) {
        $mark = " "
        if ($selections[$i]) { $mark = "x" }
        Write-Host "  [$mark] $($i+1). $($choices[$i])"
    }
    Write-Host "  [ ] d) Done"
    Write-Host "  [ ] c) Cancel"
    $choice = Read-Host "> "

    switch ($choice) {
        { $_ -in "1","2","3","4","5" } {
            $idx = [int]$choice - 1
            $selections[$idx] = -not $selections[$idx]
        }
        { $_ -in "d","D","" } {
            $any = $false
            foreach ($s in $selections) { if ($s) { $any = $true; break } }
            if (-not $any) {
                Write-Host "No agents selected. Cancelled."
                exit 0
            }
            $agentDone = $true
            break
        }
        { $_ -in "c","C" } { Write-Host "Cancelled."; exit 0 }
        default { Write-Host "  Invalid choice." }
    }
}

$use_opencode = $selections[0]
$use_claude   = $selections[1]
$use_cursor   = $selections[2]
$use_antigravity = $selections[3]
$use_kilo     = $selections[4]

# --- 1. Create directory structure ---
Write-Host ""
Write-Host ">> Creating directories..."
mkdir "$TargetDir\.agents" -Force | Out-Null
mkdir "$TargetDir\.agents\skills" -Force | Out-Null
mkdir "$TargetDir\.agents\specs" -Force | Out-Null
mkdir "$TargetDir\.agents\plans" -Force | Out-Null
mkdir "$TargetDir\.agents\research" -Force | Out-Null

if ($use_claude) { mkdir "$TargetDir\.claude" -Force | Out-Null }
if ($use_cursor) { mkdir "$TargetDir\.cursor" -Force | Out-Null }
if ($use_antigravity) { mkdir "$TargetDir\.antigravity" -Force | Out-Null }
if ($use_kilo) { mkdir "$TargetDir\.kilo" -Force | Out-Null }

# --- Helper: download a file ---
function Download {
    param([string]$Url, [string]$Dest)
    mkdir (Split-Path $Dest -Parent) -Force | Out-Null
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Dest -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# --- Helper: compare versions (returns $true if v1 < v2) ---
function Version-Lt {
    param([string]$v1, [string]$v2)
    $parts1 = $v1.Split('.')
    $parts2 = $v2.Split('.')
    for ($i = 0; $i -lt [Math]::Max($parts1.Length, $parts2.Length); $i++) {
        $p1 = if ($i -lt $parts1.Length) { [int]$parts1[$i] } else { 0 }
        $p2 = if ($i -lt $parts2.Length) { [int]$parts2[$i] } else { 0 }
        if ($p1 -lt $p2) { return $true }
        if ($p1 -gt $p2) { return $false }
    }
    return $false
}

# --- Helper: get version string for a file path from local manifest ---
function Get-ManifestVersion {
    param([string]$ManifestPath, [string]$FilePath)
    if (-not (Test-Path $ManifestPath)) { return $null }
    $obj = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    if ($obj.modes) {
        foreach ($mode in $obj.modes.PSObject.Properties.Value) {
            if ($mode.files.$FilePath) {
                $v = $mode.files.$FilePath
                return (Extract-Version $v)
            }
        }
        return $null
    } elseif ($obj.workflows) {
        foreach ($wf in $obj.workflows.PSObject.Properties.Value) {
            foreach ($stage in $wf.stages.PSObject.Properties.Value) {
                if ($stage.files.$FilePath) {
                    $v = $stage.files.$FilePath
                    return (Extract-Version $v)
                }
            }
        }
        return $null
    } elseif ($obj.files) {
        return (Extract-Version $obj.files.$FilePath)
    }
    return $null
}

function Extract-Version {
    param([object]$Value)
    if ($Value -is [string]) { return $Value }
    if ($Value.version) { return $Value.version }
    return "0.0.0"
}

# --- Helper: flatten selected workflows into a file dictionary ---
function Flatten-WorkflowFiles {
    param([PSObject]$ManifestObj, [int[]]$SelectedIndices)
    $wfNames = @($ManifestObj.workflows.PSObject.Properties.Name)
    $files = @{}
    foreach ($idx in $SelectedIndices) {
        $wfName = $wfNames[$idx]
        $wf = $ManifestObj.workflows.$wfName
        foreach ($stage in $wf.stages.PSObject.Properties.Value) {
            foreach ($entry in $stage.files.PSObject.Properties) {
                $files[$entry.Name] = Extract-Version $entry.Value
            }
        }
    }
    return $files
}

# --- 2. Download remote manifest ---
Write-Host ""
Write-Host ">> Fetching manifest..."

$localManifestPath = "$TargetDir\.agents\manifest.json"
$remoteManifest = New-TemporaryFile

$manifestOk = Download -Url "$RAW_BASE/.agents/manifest.json" -Dest $remoteManifest.FullName
if (-not $manifestOk) {
    Write-Host "  !! Failed to download manifest. Aborting."
    Remove-Item $remoteManifest.FullName -Force -ErrorAction SilentlyContinue
    exit 1
}

$remoteManifestObj = Get-Content $remoteManifest.FullName -Raw | ConvertFrom-Json

$localManifestObj = $null
if (Test-Path $localManifestPath) {
    $localManifestObj = Get-Content $localManifestPath -Raw | ConvertFrom-Json
}

# Detect format and optionally prompt for mode/workflow selection
$remoteFiles = @{}
$selectedMode = ""

if ($remoteManifestObj.modes) {
    # --- Mode Selection (single choice) ---
    $modeNames = @($remoteManifestObj.modes.PSObject.Properties.Name)

    if ($modeNames.Count -eq 0) {
        Write-Host "  !! No modes found in manifest. Aborting."
        Remove-Item $remoteManifest.FullName -Force -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Host ""
    Write-Host "Select development mode (enter number):"

    $modeDone = $false
    while (-not $modeDone) {
        for ($i = 0; $i -lt $modeNames.Count; $i++) {
            $desc = $remoteManifestObj.modes.$($modeNames[$i]).description
            $mark = " "
            if ($selectedMode -eq $modeNames[$i]) { $mark = "x" }
            Write-Host "  [$mark] $($i+1). $($modeNames[$i])"
            Write-Host "       $desc"
        }
        Write-Host "  [ ] c) Cancel"
        $choice = Read-Host "> "

        switch ($choice) {
            { $_ -match '^\d+$' } {
                $idx = [int]$choice - 1
                if ($idx -ge $modeNames.Count) {
                    Write-Host "  Invalid choice."
                    break
                }
                $selectedMode = $modeNames[$idx]
                $modeDone = $true
            }
            { $_ -in "c","C" } { Write-Host "Cancelled."; Remove-Item $remoteManifest.FullName -Force -ErrorAction SilentlyContinue; exit 0 }
            default { Write-Host "  Invalid choice." }
        }
    }

    $modeDesc = $remoteManifestObj.modes.$selectedMode.description

    Write-Host ""
    Write-Host ">> Checking for updates..."
    Write-Host "  Mode: $selectedMode -> $modeDesc"

    # Display skills for the selected mode
    $modeFiles = $remoteManifestObj.modes.$selectedMode.files
    $skills = @()
    foreach ($entry in $modeFiles.PSObject.Properties) {
        if ($entry.Name -like '*/SKILL.md') {
            $skills += ($entry.Name -split '/')[-2]
        }
    }
    if ($skills) {
        Write-Host "  Skills:"
        foreach ($s in ($skills | Sort-Object)) { Write-Host "    - $s" }
    }

    # Flatten files for this mode (extract version strings)
    foreach ($entry in $modeFiles.PSObject.Properties) {
        $remoteFiles[$entry.Name] = Extract-Version $entry.Value
    }

    $skillDirs = @()
} elseif ($remoteManifestObj.workflows) {
    # --- Backward compatibility: legacy workflows structure (v2.x) ---
    $wfNames = @($remoteManifestObj.workflows.PSObject.Properties.Name)
    $wfSelections = @($false) * $wfNames.Count

    Write-Host ""
    Write-Host "Select workflows to install (enter number to toggle, 'd' when done):"

    $wfDone = $false
    while (-not $wfDone) {
        for ($i = 0; $i -lt $wfNames.Count; $i++) {
            $mark = " "
            if ($wfSelections[$i]) { $mark = "x" }
            Write-Host "  [$mark] $($i+1). $($wfNames[$i])"
        }
        Write-Host "  [ ] d) Done"
        Write-Host "  [ ] c) Cancel"
        $choice = Read-Host "> "

        switch ($choice) {
            { $_ -match '^\d+$' } {
                $idx = [int]$choice - 1
                if ($idx -ge $wfNames.Count) {
                    Write-Host "  Invalid choice."
                    break
                }
                $wfSelections[$idx] = -not $wfSelections[$idx]
            }
            { $_ -in "d","D","" } {
                $any = $false
                foreach ($s in $wfSelections) { if ($s) { $any = $true; break } }
                if (-not $any) {
                    Write-Host "  !! No workflows selected."
                    break
                }
                $wfDone = $true
                break
            }
            { $_ -in "c","C" } { Write-Host "Cancelled."; Remove-Item $remoteManifest.FullName -Force -ErrorAction SilentlyContinue; exit 0 }
            default { Write-Host "  Invalid choice." }
        }
    }

    $selectedIndices = @()
    $selectedNames = @()
    for ($i = 0; $i -lt $wfSelections.Count; $i++) {
        if ($wfSelections[$i]) {
            $selectedIndices += $i
            $selectedNames += $wfNames[$i]
        }
    }

    $skillDirs = @()

    Write-Host ""
    Write-Host ">> Checking for updates..."
    Write-Host "  Workflows: $($selectedNames -join ' ')"

    $allFiles = @{}
    foreach ($wfName in $remoteManifestObj.workflows.PSObject.Properties.Name) {
        $wf = $remoteManifestObj.workflows.$wfName
        $wfFiles = @()
        foreach ($stage in $wf.stages.PSObject.Properties.Value) {
            foreach ($entry in $stage.files.PSObject.Properties) {
                $wfFiles += $entry.Name
            }
        }
        $allFiles[$wfName] = $wfFiles
    }
    $allSkills = @{}
    foreach ($wfName in $allFiles.Keys) {
        foreach ($f in $allFiles[$wfName]) {
            if ($f -like '*/SKILL.md') {
                $skillName = ($f -split '/')[-2]
                $allSkills[$skillName] = $true
            }
        }
    }
    $essential = @($allSkills.Keys | Where-Object { $_ -notlike 'frontend-*' -and $_ -notlike 'backend-*' -and $_ -notlike 'testdriven-*' } | Sort-Object)
    $frontend  = @($allSkills.Keys | Where-Object { $_ -like 'frontend-*' } | Sort-Object)
    $backend   = @($allSkills.Keys | Where-Object { $_ -like 'backend-*' } | Sort-Object)
    $testdriven = @($allSkills.Keys | Where-Object { $_ -like 'testdriven-*' } | Sort-Object)
    if ($essential) {
        Write-Host "  Essential Skills:"
        foreach ($s in $essential) { Write-Host "    - $s" }
    }
    if ($frontend) {
        Write-Host "  frontend:"
        foreach ($s in $frontend) { Write-Host "    - $s" }
    }
    if ($backend) {
        Write-Host "  backend:"
        foreach ($s in $backend) { Write-Host "    - $s" }
    }
    if ($testdriven) {
        Write-Host "  testdriven:"
        foreach ($s in $testdriven) { Write-Host "    - $s" }
    }

    $remoteFiles = Flatten-WorkflowFiles -ManifestObj $remoteManifestObj -SelectedIndices $selectedIndices
} elseif ($remoteManifestObj.files) {
    # --- Backward compatibility: flat files structure (v1.x) ---
    Write-Host ""
    Write-Host ">> Checking for updates..."

    foreach ($entry in $remoteManifestObj.files.PSObject.Properties) {
        $remoteFiles[$entry.Name] = Extract-Version $entry.Value
    }
    $skillDirs = @()
} else {
    Write-Host "  !! Unknown manifest format. Aborting."
    Remove-Item $remoteManifest.FullName -Force -ErrorAction SilentlyContinue
    exit 1
}

# --- 3. Download/update files ---
foreach ($entry in $remoteFiles.GetEnumerator()) {
    $path = $entry.Key
    $remoteVer = $entry.Value

    # Skip AGENTS.md — generated locally to avoid stale remote content
    if ($path -eq 'AGENTS.md') {
        Write-Host "     $path (generated locally)"
        continue
    }

    $localPath = $path.Replace('/', '\')
    $dest = "$TargetDir\$localPath"
    $url = "$RAW_BASE/$path"

    if (-not (Test-Path $dest)) {
        mkdir (Split-Path $dest -Parent) -Force | Out-Null
        Write-Host "  >> $path (new)"
        $ok = Download -Url $url -Dest $dest
        if (-not $ok) { Write-Host "  !! Failed to download $path" }
    } else {
        if ($path -like '*/SKILL.md') {
            $localVer = Get-ManifestVersion -ManifestPath $localManifestPath -FilePath $path
            if (-not $localVer) { $localVer = "0.0.0" }
            if (Version-Lt $localVer $remoteVer) {
                Write-Host "  >> $path ($localVer -> $remoteVer)"
                $answer = Read-Host "    Overwrite? [y/N]"
                if ($answer -eq "y" -or $answer -eq "Y") {
                    $ok = Download -Url $url -Dest $dest
                    if (-not $ok) { Write-Host "  !! Failed to download $path" }
                } else {
                    Write-Host "    Skipped."
                }
                continue
            }
        }
        Write-Host "     $path (up to date)"
    }
}

Remove-Item $remoteManifest.FullName -Force -ErrorAction SilentlyContinue

# Save updated local manifest
Download -Url "$RAW_BASE/.agents/manifest.json" -Dest $localManifestPath | Out-Null

# --- Ensure AGENTS.md exists with neutral header (never downloaded from remote) ---
$agentsPath = "$TargetDir\AGENTS.md"
$neutralHeader = @'
# Shared AI Agent Instructions

Global instructions and behavioral constraints live in this file.
Project-specific scripts, technology choices, and setup instructions are documented in `README.md`.
'@
if (-not (Test-Path $agentsPath)) {
    Set-Content -Path $agentsPath -Value $neutralHeader -NoNewline
    Write-Host ">> Created AGENTS.md"
}

# --- Mark AGENTS.md with mode (bootstrap skill fills the full protocol) ---
if ($selectedMode -and (Test-Path $agentsPath)) {
    $modeTitle = (Get-Culture).TextInfo.ToTitleCase(($selectedMode -replace '-', ' '))
    $protocolHeader = "## ${modeTitle} Execution Protocol"

    $agentsContent = Get-Content $agentsPath -Raw
    if ($agentsContent -notmatch [regex]::Escape($protocolHeader)) {
        Write-Host ""
        Write-Host ">> Marking AGENTS.md with $modeTitle mode..."
        $protocolSection = @"

$protocolHeader

All file modifications or code generation tasks in this project MUST follow the
${modeTitle} lifecycle defined below. The bootstrap skill will complete this
section with the full protocol after initial project analysis.

"@
        Add-Content -Path $agentsPath -Value $protocolSection -NoNewline
    }
}

# --- 4. Generate supplementary explicit configurations ---
if ($use_opencode -and -not (Test-Path "$TargetDir\opencode.json")) {
    Write-Host ">> Creating opencode.json..."
    if ($skillDirs.Count -gt 0) {
        $config = @{
            '$schema' = 'https://opencode.ai/config.json'
            skills = @{
                paths = @($skillDirs | ForEach-Object { ".agents/skills/$_" })
            }
            instructions = @(($skillDirs | ForEach-Object { ".agents/skills/$_/**/SKILL.md" }) + "AGENTS.md")
        }
        $config | ConvertTo-Json -Depth 3 | Set-Content "$TargetDir\opencode.json"
    } else {
        $config = @{
            '$schema' = 'https://opencode.ai/config.json'
            skills = @{
                paths = @(".agents/skills")
            }
            instructions = @(".agents/skills/**/SKILL.md", "AGENTS.md")
        }
        $config | ConvertTo-Json -Depth 3 | Set-Content "$TargetDir\opencode.json"
    }
}

if ($use_claude -and -not (Test-Path "$TargetDir\CLAUDE.md")) {
    Write-Host ">> Creating CLAUDE.md..."
    @'
# Claude Code Settings

@AGENTS.md

## Claude-Specific Instructions
- Utilize the symlinked skills located in `.claude/skills/` when triggered.
'@ | Set-Content "$TargetDir\CLAUDE.md" -NoNewline
}

if ($use_antigravity -and -not (Test-Path "$TargetDir\.antigravity\workflows.json")) {
    Write-Host ">> Creating .antigravity/workflows.json..."
    mkdir "$TargetDir\.antigravity" -Force | Out-Null
    $config = @{
        workflows = @(
            @{
                name = "example"
                description = "Example workflow referencing shared .agents/skills"
            }
        )
    }
    $config | ConvertTo-Json -Depth 3 | Set-Content "$TargetDir\.antigravity\workflows.json"
}

if ($use_kilo -and -not (Test-Path "$TargetDir\.kilo\config.json")) {
    Write-Host ">> Creating .kilo/config.json..."
    mkdir "$TargetDir\.kilo" -Force | Out-Null
    if ($skillDirs.Count -gt 0) {
        $instructions = @("AGENTS.md")
        $instructions += $skillDirs | ForEach-Object { ".agents/skills/$_/**/SKILL.md" }
        $config = @{
            '$schema' = 'https://app.kilo.ai/config.json'
            instructions = $instructions
        }
        $config | ConvertTo-Json -Depth 3 | Set-Content "$TargetDir\.kilo\config.json"
    } else {
        $config = @{
            '$schema' = 'https://app.kilo.ai/config.json'
            instructions = @("AGENTS.md", ".agents/skills/*/SKILL.md")
        }
        $config | ConvertTo-Json -Depth 3 | Set-Content "$TargetDir\.kilo\config.json"
    }
}

# --- 5. Create symbolic links ---
Write-Host ""
Write-Host ">> Linking agent skill directories..."

function Migrate-And-Symlink {
    param([string]$Src, [string]$Dest, [string]$Label)
    $srcPath = "$TargetDir\$Src"
    $destAbs = "$TargetDir\.agents\skills"

    if ((Test-Path $srcPath) -and -not (Get-Item $srcPath).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Write-Host "   -> Migrating existing $Label assets into .agents..."
        Get-ChildItem "$srcPath\*" -ErrorAction SilentlyContinue | Copy-Item -Destination "$TargetDir\.agents\skills\" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $srcPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $srcPath) {
        Remove-Item $srcPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    try {
        New-Item -ItemType SymbolicLink -Path $srcPath -Target $Dest -Force -ErrorAction Stop | Out-Null
        Write-Host "   -> Linked $srcPath -> $Dest"
    } catch {
        Write-Host "   !! Failed to create symlink: $srcPath -> $Dest"
        Write-Host "   !! Windows requires Administrator privileges or Developer Mode for symlinks."
        Write-Host "   !! See: https://learn.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development"
        $answer = Read-Host "   Retry as admin? [y/N]"
        if ($answer -eq "y" -or $answer -eq "Y") {
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = "powershell.exe"
            $psi.Verb = "runas"
            $psi.Arguments = "-NoProfile -Command `"New-Item -ItemType SymbolicLink -Path '$srcPath' -Target '$Dest' -Force`""
            try {
                [System.Diagnostics.Process]::Start($psi) | Out-Null
                Write-Host "   -> Admin elevation requested for symlink creation."
            } catch {
                Write-Host "   !! Admin elevation failed. Falling back to copy instead of symlink."
                Copy-Item -Path "$destAbs\*" -Destination $srcPath -Recurse -Force -ErrorAction SilentlyContinue
            }
        } else {
            Write-Host "   !! Falling back to copy instead of symlink."
            Copy-Item -Path "$destAbs\*" -Destination $srcPath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($use_claude) { Migrate-And-Symlink -Src ".claude\skills" -Dest "..\.agents\skills" -Label "Claude Code" }
if ($use_cursor) { Migrate-And-Symlink -Src ".cursor\skills" -Dest "..\.agents\skills" -Label "Cursor" }

Write-Host ""
Write-Host ">> Symbolic links created:"
if ($use_claude) { Write-Host "  - $TargetDir\.claude\skills -> ..\.agents\skills" }
if ($use_cursor) { Write-Host "  - $TargetDir\.cursor\skills -> ..\.agents\skills" }

Write-Host ""
Write-Host ">> Done. Target: $TargetDir"
