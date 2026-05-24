$partyPath = "D:\Programming\Projects\ArtistCRM\app\party"
$pagePath = Join-Path $partyPath "page.js"
$componentPath = Join-Path $partyPath "PartyPricingSection.js"
$tmpPath = Join-Path $env:TEMP "page_new.js"

# Read current page.js
$content = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)

# Patch 1: Add import
$old1 = "import Link from 'next/link'`r`n`r`nconst rawPartyDomain"
$new1 = "import Link from 'next/link'`r`nimport PartyPricingSection from './PartyPricingSection'`r`n`r`nconst rawPartyDomain"
$content = $content.Replace($old1, $new1)

# Patch 2: Replace pricing section JSX
$startMarker = "{/* Pricing section */}"
$endTarget = "</section>`r`n`r`n      {/* FAQ section */}"
$endTarget2 = "</section>`n`n      {/* FAQ section */}"

$startIdx = $content.IndexOf($startMarker)
if ($startIdx -eq -1) { Write-Error "start marker not found"; exit 1 }

$endIdx = $content.IndexOf($endTarget)
if ($endIdx -eq -1) { $endIdx = $content.IndexOf($endTarget2) }
if ($endIdx -eq -1) { Write-Error "end marker not found"; exit 1 }
$endIdx += "</section>".Length

$oldPricingSection = $content.Substring($startIdx, $endIdx - $startIdx)
$newPricingSection = "{/* Pricing section */}`r`n      <section id=`"pricing`" className=`"relative max-w-6xl px-6 pb-20 mx-auto`">`r`n        <PartyPricingSection />`r`n      </section>"

$content = $content.Replace($oldPricingSection, $newPricingSection)

# Write modified page.js
[System.IO.File]::WriteAllText($pagePath, $content, [System.Text.Encoding]::UTF8)

# Verify
$v = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
if ($v.Contains("import PartyPricingSection") -and $v.Contains("<PartyPricingSection")) {
    Write-Output "OK"
} else {
    Write-Error "VERIFICATION FAILED"
    exit 1
}
