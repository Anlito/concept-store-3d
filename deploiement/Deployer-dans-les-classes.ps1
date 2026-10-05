# Concept Store 3D - copie l'outil dans le dossier de chaque classe (liste dans classes.txt).
# Copie seulement les fichiers nouveaux ou modifies ; ne supprime rien (les projets des eleves restent intacts).
# Aucune installation necessaire (PowerShell et robocopy sont fournis avec Windows).
param(
  [string]$Source = (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'Concept-Store-3D'),
  [string]$Classes = (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'classes.txt')
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Join-Path $Source 'index.html'))) {
  Write-Host "ERREUR : outil introuvable dans $Source" -ForegroundColor Red
  Write-Host 'Le dossier Concept-Store-3D doit etre a cote de ce script.'
  exit 2
}
if (-not (Test-Path $Classes)) {
  Write-Host "ERREUR : liste des classes introuvable ($Classes)" -ForegroundColor Red
  exit 2
}

# classes.txt : UTF-8 (Bloc-notes recent) ou ANSI (ancien Bloc-notes), pour les chemins avec accents.
$octets = [IO.File]::ReadAllBytes($Classes)
try { $texte = (New-Object Text.UTF8Encoding($false, $true)).GetString($octets) }
catch { $texte = [Text.Encoding]::Default.GetString($octets) }
$lignes = @($texte -split "`r?`n" | ForEach-Object { $_.Trim().TrimStart([char]0xFEFF).Trim('"') } | Where-Object { $_ -and -not $_.StartsWith('#') })
if (-not $lignes.Count) {
  Write-Host 'Aucun dossier de classe dans classes.txt : ouvrir ce fichier et ajouter un chemin par ligne.' -ForegroundColor Yellow
  exit 2
}

# 1. Mobilier du professeur : liste a jour avant la copie (seulement s'il y a des modeles .glb).
$mobilier = Join-Path $Source 'Mobilier'
$maj = Join-Path $mobilier 'Mettre-a-jour-le-mobilier.ps1'
if ((Test-Path $maj) -and @(Get-ChildItem -Path $mobilier -Recurse -Filter *.glb).Count) {
  Write-Host 'Mise a jour du mobilier du professeur...'
  & $maj
  Write-Host ''
}

# 2. Copie dans chaque classe.
$ok = 0; $erreurs = 0
foreach ($classe in $lignes) {
  if (-not (Test-Path -LiteralPath $classe -PathType Container)) {
    Write-Host "ECHEC   $classe : dossier introuvable ou inaccessible" -ForegroundColor Red
    $erreurs++; continue
  }
  $dest = Join-Path $classe 'Concept-Store-3D'
  & robocopy $Source $dest /E /R:1 /W:1 /NP /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -lt 8) { Write-Host "OK      $dest" -ForegroundColor Green; $ok++ }
  else { Write-Host "ECHEC   $dest : copie impossible (droits d ecriture ?)" -ForegroundColor Red; $erreurs++ }
}
Write-Host ''
Write-Host "$ok classe(s) a jour, $erreurs echec(s)."
if ($erreurs) { exit 1 } else { exit 0 }
