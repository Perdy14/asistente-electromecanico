' Script de arranque - MecanicaAI
' Arranca el servidor y el tunel de Tailscale en segundo plano
Set WshShell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")

baseDir = "c:\Users\anton\OneDrive\Desktop\proyecto IES LA PALMA\asistente-electromecanico"

' Esperar 15 segundos a que Windows termine de arrancar y la red este lista
WScript.Sleep 15000

' 1. Arrancar el servidor node
WshShell.CurrentDirectory = baseDir
WshShell.Run "cmd /c node server.js > server.log 2>&1", 0, False

' Esperar 8 segundos a que el servidor este listo
WScript.Sleep 8000

' 2. Activar el Tailscale Funnel (URL fija publica)
' Si ya estaba activo, este comando no hace nada nuevo
WshShell.Run "cmd /c """"C:\Program Files\Tailscale\tailscale.exe"" funnel --bg --https=443 http://localhost:3000 > """ & baseDir & "\tunnel.log"" 2>&1""", 0, False

' Guardar la URL fija en el escritorio
desktopPath = WshShell.SpecialFolders("Desktop")
Set urlFile = fs.CreateTextFile(desktopPath & "\URL-MecanicaAI.txt", True)
urlFile.WriteLine "============================================"
urlFile.WriteLine "  URL PUBLICA DE TU ASISTENTE MECANICAAI"
urlFile.WriteLine "============================================"
urlFile.WriteLine ""
urlFile.WriteLine "https://mecanicaai.tailabb588.ts.net"
urlFile.WriteLine ""
urlFile.WriteLine "URL local (solo este PC): http://localhost:3000"
urlFile.WriteLine ""
urlFile.WriteLine "Esta URL es PERMANENTE y nunca cambia."
urlFile.WriteLine "Compartela con quien quieras."
urlFile.WriteLine ""
urlFile.WriteLine "Iniciado: " & Now()
urlFile.Close
