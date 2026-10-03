# Concept Store 3D - met a jour mobilier-prof.js a partir des fichiers .glb de ce dossier
# (et de ses sous-dossiers : Assises, Rangements, Comptoirs, Tables, Portants, Plantes, Luminaires, Decor).
# A lancer apres avoir ajoute ou retire des modeles. Aucune installation necessaire.
$ErrorActionPreference = 'Stop'
$dossier = Split-Path -Parent $MyInvocation.MyCommand.Path
$fichiers = @(Get-ChildItem -Path $dossier -Recurse -Filter *.glb | Sort-Object FullName)
$items = foreach ($f in $fichiers) {
  $rel = $f.FullName.Substring($dossier.Length + 1).Replace([string][char]92, '/')
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
  '{"path":' + (ConvertTo-Json $rel -Compress) + ',"size":' + $f.Length + ',"data":"' + $b64 + '"}'
}
$date = Get-Date -Format 'dd/MM/yyyy HH:mm'
$js = "/* Fichier genere le $date par Mettre-a-jour-le-mobilier.bat : ne pas modifier a la main. */`nwindow.CS3D_MOBILIER = [`n" + ($items -join ",`n") + "`n];`n"
[IO.File]::WriteAllText((Join-Path $dossier 'mobilier-prof.js'), $js, (New-Object Text.UTF8Encoding $false))
$mo = [Math]::Round((($fichiers | Measure-Object Length -Sum).Sum) / 1MB, 1)
Write-Host "$($fichiers.Count) modele(s) enregistre(s) dans mobilier-prof.js ($mo Mo)."
Write-Host 'Les eleves les verront dans la bibliotheque, onglet "Ajouts du professeur", au prochain lancement de l outil.'
