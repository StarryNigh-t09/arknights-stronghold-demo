$desk = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desk 'coopanion-arknights.lnk'
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($lnk)
$s.TargetPath = 'C:\Users\18539\DSH-Workspaces\coopanion\coopanion-arknights'
$s.WorkingDirectory = 'C:\Users\18539\DSH-Workspaces\coopanion\coopanion-arknights'
$s.Description = 'coopanion 明日方舟卫戍协议陪玩插件'
$s.Save()
Test-Path $lnk
