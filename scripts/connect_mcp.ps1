param(
    [switch]$Configure,
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$CollectorArguments
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$mctasteLocal = Join-Path (Get-Location) '.local'
$mctasteCredentialPath = Join-Path $mctasteLocal 'mcp-token.xml'
$mctastePreviousToken = $env:MCD_MCP_TOKEN
try {
    New-Item -ItemType Directory -Path $mctasteLocal -Force | Out-Null
    if ($Configure -or (!(Test-Path -LiteralPath $mctasteCredentialPath) -and !$env:MCD_MCP_TOKEN)) {
        Write-Host 'Paste the Token from https://open.mcd.cn/mcp below. Input is hidden.'
        Write-Host 'It will be saved with Windows DPAPI for this Windows user only, then verified.'
        $mctasteSecure = Read-Host 'MCD MCP Token' -AsSecureString
        $mctasteCredential = [System.Management.Automation.PSCredential]::new('mcd-mcp', $mctasteSecure)
        $env:MCD_MCP_TOKEN = $mctasteCredential.GetNetworkCredential().Password.Trim()
        if (!$env:MCD_MCP_TOKEN) { throw 'Token is empty.' }
        $mctasteCredential | Export-Clixml -LiteralPath $mctasteCredentialPath
        & python scripts/sync_catalog.py discover --out .local/tools.json
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'Credential saved encrypted. Connection failed; do not paste your Token into chat.'
            throw 'Connection failed.'
        }
        Write-Host 'Connected. Encrypted credential saved in .local/mcp-token.xml.'
    } elseif (!$env:MCD_MCP_TOKEN) {
        $mctasteCredential = Import-Clixml -LiteralPath $mctasteCredentialPath
        $env:MCD_MCP_TOKEN = $mctasteCredential.GetNetworkCredential().Password.Trim()
    }
    if ($CollectorArguments.Count -gt 0) {
        & python scripts/sync_catalog.py @CollectorArguments
        if ($LASTEXITCODE -ne 0) { throw 'MCP request failed.' }
    } elseif (!$Configure) {
        & python scripts/sync_catalog.py discover --out .local/tools.json
        if ($LASTEXITCODE -ne 0) { throw 'Connection failed.' }
    }
} catch {
    # Avoid echoing credentials or raw server responses in errors.
    Write-Host 'MCP setup/request did not finish. Check the connection message above.' -ForegroundColor Red
    exit 1
} finally {
    $env:MCD_MCP_TOKEN = $mctastePreviousToken
    $mctasteCredential = $null
    $mctasteSecure = $null
}
