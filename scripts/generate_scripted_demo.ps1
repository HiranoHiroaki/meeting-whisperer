param(
  [string]$InputDir = 'doc/samples',
  [string]$CleanDir = 'doc/samples/scripted-clean',
  [string]$DemoDir = 'doc/samples/scripted-demo'
)

$blockedPhrases = @(
  '知ったかくん',
  'knowledge_profile',
  'MVP',
  'Teams',
  'Speech',
  '音声認識',
  '会議要約',
  '理解不足補完',
  '補助脳',
  '評価用途',
  'ローカル保存',
  'unknown',
  'interest',
  'クリック履歴',
  '用語抽出',
  'クリック補完',
  '個人ノート生成',
  'デモ',
  'Familiar',
  'Weak',
  'Curious',
  'Recently Learned',
  'リアルタイム音声'
)

$bannedTerms = @(
  'knowledge_profile',
  'MVP',
  'Teams',
  'Speech',
  'unknown',
  'interest'
)

$categoryByFile = @{
  'sample-01-system-development.md' = 'システム開発'
  'sample-02-management.md' = '経営'
  'sample-03-manufacturing.md' = '製造業界'
  'sample-04-fashion.md' = '服飾'
  'sample-05-welfare-services.md' = '福祉サービス'
  'sample-06-healthcare.md' = '看護・医療'
  'sample-07-homelab.md' = '特殊例（自作PC・ホームラボ）'
  'sample-08-social-slang.md' = '特殊例（略語地獄・界隈会話）'
}

function ContainsBlockedPhrase {
  param([string]$Text)
  foreach ($p in $blockedPhrases) {
    if ($Text -match [Regex]::Escape($p)) {
      return $true
    }
  }
  return $false
}

function IsBannedTerm {
  param([string]$Term)
  foreach ($p in $bannedTerms) {
    if ($Term -match [Regex]::Escape($p)) {
      return $true
    }
  }
  return $false
}

function GetSectionList {
  param(
    [string[]]$Lines,
    [string]$Header
  )

  $start = -1
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i].Trim() -eq $Header) {
      $start = $i
      break
    }
  }

  if ($start -lt 0) {
    return @()
  }

  $items = @()
  for ($i = $start + 1; $i -lt $Lines.Count; $i++) {
    $line = $Lines[$i].Trim()
    if ($line -like '## *') {
      break
    }
    if ($line -like '- *') {
      $items += $line.Substring(2).Trim()
    }
  }
  return $items
}

function ExtractMeetingSection {
  param([string[]]$Lines)

  $start = -1
  $end = -1
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    $line = $Lines[$i].Trim()
    if ($line -eq '## 会議録（議事録ではない）') {
      $start = $i
    }
    if ($line -eq '## Expected Terms') {
      $end = $i
      break
    }
  }

  if ($start -lt 0 -or $end -lt 0 -or $end -le $start) {
    return @()
  }

  return $Lines[($start + 1)..($end - 1)]
}

function ParseUtterances {
  param([string[]]$MeetingLines)

  $meetingTitle = ''
  $titleIndex = -1
  for ($i = 0; $i -lt $MeetingLines.Count; $i++) {
    $line = $MeetingLines[$i].Trim()
    if ($line -match '^#\s+(.+)$') {
      $meetingTitle = $matches[1].Trim()
      $titleIndex = $i
      break
    }
  }

  if ($titleIndex -lt 0) {
    return @{ title = ''; utterances = @() }
  }

  $utterances = @()
  $current = $null

  for ($i = $titleIndex + 1; $i -lt $MeetingLines.Count; $i++) {
    $lineRaw = $MeetingLines[$i]
    $line = $lineRaw.Trim()
    if ($line -eq '') {
      continue
    }

    if ($line -match '^([一-龯々]{1,6})：$') {
      if ($null -ne $current) {
        $utterances += $current
      }
      $current = [ordered]@{
        speaker = $matches[1].Trim()
        text = ''
      }
      continue
    }

    if ($null -eq $current) {
      continue
    }

    if ([string]::IsNullOrWhiteSpace($current.text)) {
      $current.text = $line
    } else {
      $current.text += "`n$line"
    }
  }

  if ($null -ne $current) {
    $utterances += $current
  }

  return @{ title = $meetingTitle; utterances = $utterances }
}

function FindHighlightTerms {
  param(
    [string]$Text,
    [string[]]$Terms
  )

  $hits = @()
  $lower = $Text.ToLowerInvariant()
  foreach ($t in $Terms) {
    if ([string]::IsNullOrWhiteSpace($t)) {
      continue
    }
    if ($lower.Contains($t.ToLowerInvariant())) {
      $hits += $t
    }
  }
  return $hits
}

New-Item -ItemType Directory -Path $CleanDir -Force | Out-Null
New-Item -ItemType Directory -Path $DemoDir -Force | Out-Null

$sourceFiles = Get-ChildItem -Path $InputDir -Filter 'sample-*.md' -File | Sort-Object Name

$cleanReadmeLines = @(
  '# Scripted Clean Logs',
  '',
  'Scripted Demo向けに、自己言及・実装相談系発話を除外した会議録。',
  '',
  '## Index'
)

$demoReadmeLines = @(
  '# Scripted Demo JSON',
  '',
  '左ペイン逐次再生 + 右ペイン用語チップ表示を想定した再生用データ。',
  '',
  '## Index'
)

foreach ($file in $sourceFiles) {
  $lines = Get-Content -Path $file.FullName

  $expectedTerms = GetSectionList -Lines $lines -Header '## Expected Terms'
  $expectedWeak = GetSectionList -Lines $lines -Header '## Expected Weak Contexts'
  $meetingLines = ExtractMeetingSection -Lines $lines
  $parsed = ParseUtterances -MeetingLines $meetingLines

  $meetingTitle = $parsed.title
  $utterances = $parsed.utterances

  $kept = @()
  $removed = @()
  foreach ($u in $utterances) {
    $u.text = $u.text.Trim()
    if ([string]::IsNullOrWhiteSpace($u.text)) {
      $removed += $u
      continue
    }
    $blob = "$($u.speaker)：`n$($u.text)"
    if (ContainsBlockedPhrase -Text $blob) {
      $removed += $u
    } else {
      $kept += $u
    }
  }

  $filteredTerms = @()
  foreach ($term in $expectedTerms) {
    if (-not (IsBannedTerm -Term $term)) {
      $filteredTerms += $term
    }
  }

  $filteredWeakContexts = @()
  foreach ($weak in $expectedWeak) {
    if ((-not (IsBannedTerm -Term $weak)) -and (-not (ContainsBlockedPhrase -Text $weak))) {
      $filteredWeakContexts += $weak
    }
  }

  $events = @()
  $timelineMs = 0
  $lineIntervalMs = 2200
  $index = 1
  foreach ($u in $kept) {
    $hits = @((FindHighlightTerms -Text $u.text -Terms $filteredTerms))

    $events += [ordered]@{
      at_ms = $timelineMs
      type = 'line'
      index = $index
      speaker = $u.speaker
      text = $u.text
      highlight_terms = @($hits)
    }

    if ($hits.Count -gt 0) {
      $events += [ordered]@{
        at_ms = $timelineMs + 450
        type = 'term_chip'
        terms = @($hits)
      }
    }

    $timelineMs += $lineIntervalMs
    $index += 1
  }

  $id = [IO.Path]::GetFileNameWithoutExtension($file.Name)
  $category = $categoryByFile[$file.Name]

  $cleanMdPath = Join-Path $CleanDir ("$id-clean.md")
  $demoJsonPath = Join-Path $DemoDir ("$id-demo.json")

  $cleanLines = @()
  $cleanLines += "# Scripted Clean: $category"
  $cleanLines += ''
  $cleanLines += "Source: ../$($file.Name)"
  $cleanLines += ''
  $cleanLines += "Removed Utterances: $($removed.Count) / $($utterances.Count)"
  $cleanLines += ''
  $cleanLines += '## 会話ログ'
  $cleanLines += ''
  $cleanLines += "# $meetingTitle"
  $cleanLines += ''

  foreach ($u in $kept) {
    $cleanLines += "$($u.speaker)："
    foreach ($line in ($u.text -split "`n")) {
      if (-not [string]::IsNullOrWhiteSpace($line)) {
        $cleanLines += $line.Trim()
      }
    }
    $cleanLines += ''
  }

  $cleanLines += '## Expected Terms (Scripted)'
  foreach ($t in $filteredTerms) {
    $cleanLines += "- $t"
  }

  $cleanLines += ''
  $cleanLines += '## Expected Weak Contexts'
  foreach ($w in $filteredWeakContexts) {
    $cleanLines += "- $w"
  }

  Set-Content -Path $cleanMdPath -Value $cleanLines -Encoding UTF8

  $demoPayload = [ordered]@{
    id = $id
    category = $category
    meeting_title = $meetingTitle
    source_file = "doc/samples/$($file.Name)"
    clean_file = ("doc/samples/scripted-clean/$id-clean.md")
    line_interval_ms = $lineIntervalMs
    max_term_chips = 5
    utterance_count = $kept.Count
    removed_utterance_count = $removed.Count
    expected_terms = $filteredTerms
    expected_weak_contexts = $filteredWeakContexts
    events = $events
  }

  $demoPayload | ConvertTo-Json -Depth 8 | Set-Content -Path $demoJsonPath -Encoding UTF8

  if (-not $script:fileCounter) {
    $script:fileCounter = 1
  }
  $cleanReadmeLines += "$($script:fileCounter). [$id-clean](./$id-clean.md)"
  $demoReadmeLines += "$($script:fileCounter). [$id-demo](./$id-demo.json)"
  $script:fileCounter += 1
}

Set-Content -Path (Join-Path $CleanDir 'README.md') -Value $cleanReadmeLines -Encoding UTF8
Set-Content -Path (Join-Path $DemoDir 'README.md') -Value $demoReadmeLines -Encoding UTF8
