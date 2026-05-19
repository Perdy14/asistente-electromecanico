' Script de arranque - Servidor MecanicaAI
' Se ejecuta sin ventanas visibles
Set WshShell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")

baseDir = "c:\Users\anton\OneDrive\Desktop\proyecto IES LA PALMA\asistente-electromecanico"

' Esperar 10 segundos a que Windows termine de arrancar y la red este lista
WScript.Sleep 10000

' 1. Arrancar el servidor node
WshShell.CurrentDirectory = baseDir
WshShell.Run "cmd /c node server.js > server.log 2>&1", 0, False

' Esperar 5 segundos a que el servidor este listo
WScript.Sleep 5000

' 2. Arrancar el tunel de Cloudflare y guardar log
WshShell.Run "cmd /c """"C:\Users\anton\cloudflared.exe"" tunnel --url http://localhost:3000 > """ & baseDir & "\tunnel.log"" 2>&1""", 0, False

' Esperar 15 segundos a que el tunel se establezca
WScript.Sleep 15000

' 3. Leer el log del tunel y extraer SOLO la URL de trycloudflare.com
logPath = baseDir & "\tunnel.log"
If fs.FileExists(logPath) Then
    Set logFile = fs.OpenTextFile(logPath, 1)
    contenido = logFile.ReadAll
    logFile.Close

    ' Buscar especificamente "trycloudflare.com" y retroceder hasta encontrar "https://"
    posTrycf = InStr(contenido, ".trycloudflare.com")
    If posTrycf > 0 Then
        ' Buscar hacia atras desde trycloudflare.com hasta "https://"
        ' Cogemos los 200 caracteres anteriores y buscamos ahi
        startSearch = posTrycf - 200
        If startSearch < 1 Then startSearch = 1
        snippet = Mid(contenido, startSearch, 200)

        ' Buscar la ultima ocurrencia de "https://" en ese snippet
        lastHttps = 0
        searchPos = 1
        Do
            found = InStr(searchPos, snippet, "https://")
            If found > 0 Then
                lastHttps = found
                searchPos = found + 1
            Else
                Exit Do
            End If
        Loop

        If lastHttps > 0 Then
            urlInicio = startSearch + lastHttps - 1
            urlFin = posTrycf + Len(".trycloudflare.com")
            urlPublica = Mid(contenido, urlInicio, urlFin - urlInicio)

            ' Guardar la URL en el escritorio
            desktopPath = WshShell.SpecialFolders("Desktop")
            Set urlFile = fs.CreateTextFile(desktopPath & "\URL-MecanicaAI.txt", True)
            urlFile.WriteLine "============================================"
            urlFile.WriteLine "  URL PUBLICA DE TU ASISTENTE MECANICAAI"
            urlFile.WriteLine "============================================"
            urlFile.WriteLine ""
            urlFile.WriteLine urlPublica
            urlFile.WriteLine ""
            urlFile.WriteLine "URL local (solo este PC): http://localhost:3000"
            urlFile.WriteLine ""
            urlFile.WriteLine "Iniciado: " & Now()
            urlFile.WriteLine ""
            urlFile.WriteLine "NOTA: La URL cambia cada vez que reinicies el PC."
            urlFile.WriteLine "Comparte este enlace con quien quieras."
            urlFile.Close
        End If
    End If
End If
