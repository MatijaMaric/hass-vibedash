#!/usr/bin/env pwsh
<#
.SYNOPSIS
Release script for VibeDash - bumps version and creates a git tag for release

.DESCRIPTION
Updates version numbers in manifest.json and package.json, commits the changes,
creates a git tag, and pushes everything to origin.

.PARAMETER Type
The type of version bump: 'patch', 'minor', or 'major' (or -p, -m, -M)

.EXAMPLE
.\release.ps1 -Type patch
.\release.ps1 -p
.\release.ps1 --minor
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet('patch', 'minor', 'major', 'p', 'm', 'M')]
    [string]$Type
)

# Normalize short flags to full names
$BumpType = switch ($Type) {
    'p' { 'patch' }
    'm' { 'minor' }
    'M' { 'major' }
    default { $Type }
}

if (-not $BumpType) {
    Write-Host "Usage: .\release.ps1 [-Type] <patch|minor|major>" -ForegroundColor Red
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\release.ps1 patch"
    Write-Host "  .\release.ps1 -Type minor"
    Write-Host "  .\release.ps1 -m"
    exit 1
}

# Define file paths
$ManifestPath = "custom_components/vibedash/manifest.json"
$PackagePath = "frontend/package.json"

# Helper function to display error messages
function Write-Error-Message {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Write-Success-Message {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-Info-Message {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

# Step 1: Verify files exist
Write-Info-Message "📋 Checking if files exist..."
if (-not (Test-Path $ManifestPath)) {
    Write-Error-Message "❌ Error: $ManifestPath not found"
    exit 1
}
if (-not (Test-Path $PackagePath)) {
    Write-Error-Message "❌ Error: $PackagePath not found"
    exit 1
}
Write-Success-Message "✓ Both files found"

# Step 2: Read and parse current version from manifest.json
Write-Info-Message "📖 Reading current version from manifest.json..."
try {
    $ManifestContent = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    $CurrentVersion = $ManifestContent.version
    Write-Success-Message "✓ Current version: $CurrentVersion"
}
catch {
    Write-Error-Message "❌ Error parsing manifest.json: $_"
    exit 1
}

# Step 3: Parse version number
Write-Info-Message "🔢 Calculating new version..."
try {
    $VersionParts = $CurrentVersion -split '\.'
    if ($VersionParts.Count -ne 3) {
        throw "Invalid version format: $CurrentVersion (expected X.Y.Z)"
    }

    [int]$Major = $VersionParts[0]
    [int]$Minor = $VersionParts[1]
    [int]$Patch = $VersionParts[2]

    # Calculate new version based on bump type
    switch ($BumpType) {
        'major' {
            $Major++
            $Minor = 0
            $Patch = 0
        }
        'minor' {
            $Minor++
            $Patch = 0
        }
        'patch' {
            $Patch++
        }
    }

    $NewVersion = "$Major.$Minor.$Patch"
    Write-Success-Message "✓ New version: $NewVersion (bump: $BumpType)"
}
catch {
    Write-Error-Message "❌ Error calculating version: $_"
    exit 1
}

# Step 4: Update manifest.json
Write-Info-Message "📝 Updating manifest.json..."
try {
    $ManifestContent.version = $NewVersion
    $ManifestContent | ConvertTo-Json -Depth 10 | Set-Content $ManifestPath
    Write-Success-Message "✓ Updated manifest.json"
}
catch {
    Write-Error-Message "❌ Error updating manifest.json: $_"
    exit 1
}

# Step 5: Update package.json
Write-Info-Message "📝 Updating package.json..."
try {
    $PackageContent = Get-Content $PackagePath -Raw | ConvertFrom-Json
    $PackageContent.version = $NewVersion
    $PackageContent | ConvertTo-Json -Depth 10 | Set-Content $PackagePath
    Write-Success-Message "✓ Updated package.json"
}
catch {
    Write-Error-Message "❌ Error updating package.json: $_"
    # Rollback manifest.json
    $ManifestContent.version = $CurrentVersion
    $ManifestContent | ConvertTo-Json -Depth 10 | Set-Content $ManifestPath
    Write-Error-Message "   Rolled back manifest.json to $CurrentVersion"
    exit 1
}

# Step 6: Validate files were updated correctly
Write-Info-Message "✓ Validating changes..."
try {
    $ManifestCheck = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    $PackageCheck = Get-Content $PackagePath -Raw | ConvertFrom-Json

    if ($ManifestCheck.version -ne $NewVersion) {
        throw "manifest.json version mismatch: expected $NewVersion, got $($ManifestCheck.version)"
    }
    if ($PackageCheck.version -ne $NewVersion) {
        throw "package.json version mismatch: expected $NewVersion, got $($PackageCheck.version)"
    }
    Write-Success-Message "✓ Both files verified with version $NewVersion"
}
catch {
    Write-Error-Message "❌ Validation failed: $_"
    # Rollback both files
    $ManifestContent.version = $CurrentVersion
    $ManifestContent | ConvertTo-Json -Depth 10 | Set-Content $ManifestPath
    $PackageContent.version = $CurrentVersion
    $PackageContent | ConvertTo-Json -Depth 10 | Set-Content $PackagePath
    Write-Error-Message "   Rolled back both files to $CurrentVersion"
    exit 1
}

# Step 7: Git operations
Write-Info-Message "🔗 Staging files..."
try {
    git add $ManifestPath $PackagePath
    Write-Success-Message "✓ Files staged"
}
catch {
    Write-Error-Message "❌ Error staging files: $_"
    exit 1
}

Write-Info-Message "💾 Creating commit..."
try {
    $CommitMessage = "Release v$NewVersion"
    git commit -m $CommitMessage
    Write-Success-Message "✓ Commit created: $CommitMessage"
}
catch {
    Write-Error-Message "❌ Error creating commit: $_"
    exit 1
}

Write-Info-Message "🏷️  Creating git tag..."
try {
    $TagMessage = "Release version $NewVersion"
    git tag -a "v$NewVersion" -m $TagMessage
    Write-Success-Message "✓ Tag created: v$NewVersion"
}
catch {
    Write-Error-Message "❌ Error creating tag: $_"
    Write-Error-Message "   Rolling back commit..."
    git reset --soft HEAD~1
    git restore --staged $ManifestPath $PackagePath
    exit 1
}

Write-Info-Message "🚀 Pushing to origin..."
try {
    git push origin HEAD
    Write-Success-Message "✓ Branch pushed"
}
catch {
    Write-Error-Message "❌ Error pushing branch: $_"
    Write-Error-Message "   You may need to resolve this manually:"
    Write-Error-Message "   - Fix the issue"
    Write-Error-Message "   - Run: git push origin HEAD"
    Write-Error-Message "   - Run: git push origin v$NewVersion"
    exit 1
}

Write-Info-Message "🏷️  Pushing tags..."
try {
    git push origin "v$NewVersion"
    Write-Success-Message "✓ Tag pushed"
}
catch {
    Write-Error-Message "❌ Error pushing tag: $_"
    Write-Error-Message "   Your branch was pushed but the tag wasn't. Try:"
    Write-Error-Message "   - git push origin v$NewVersion"
    exit 1
}

# Success!
Write-Host ""
Write-Success-Message "✅ Release v$NewVersion complete!"
Write-Host ""
Write-Host "Summary:"
Write-Host "  Previous version: $CurrentVersion"
Write-Host "  New version: $NewVersion"
Write-Host "  Bump type: $BumpType"
Write-Host "  Git tag: v$NewVersion"
Write-Host ""
Write-Info-Message "The GitHub Actions workflow will now build and release this version."
