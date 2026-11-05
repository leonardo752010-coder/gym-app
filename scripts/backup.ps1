<#
  Backup del database di gym-app (Supabase, Sydney). Spiegazione: docs/backup.md

  Uso normale (dalla cartella del repository):
      npm run backup

  Cosa fa:
  - entra nel progetto online gym-app con l'accesso gia' fatto della CLI
    (npx supabase login): nessuna password in nessun file;
  - legge soltanto (pg_dump e una query in sola lettura): non modifica
    tabelle ne' dati;
  - salva 2 file nella cartella dei backup, FUORI dal repository:
      gym-app_AAAA-MM-GG_struttura.sql   (tabelle, regole, funzioni)
      gym-app_AAAA-MM-GG_dati.sql        (righe di public e auth = utenti;
                                          Storage escluso, gym-app non lo usa)
  - tiene gli ultimi 8 backup e cancella solo i file di backup piu' vecchi
    creati da questo script (stesso schema di nome), mai altro;
  - stampa dove ha salvato, quanto pesano i file e quante righe ci sono.

  Opzioni (servono solo per le prove):
      -Locale          backup del database locale di prova (dati finti),
                       file chiamati gym-app-LOCALE_...
      -Cartella <dir>  salva in un'altra cartella (sempre fuori da git)

  Serve Docker Desktop acceso (la CLI usa pg_dump dentro Docker).
#>
param(
    [switch]$Locale,
    [string]$Cartella = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'gym-app-backup')
)

$ErrorActionPreference = 'Stop'

# Solo gym-app. Il riferimento e' scritto qui apposta: anche se la CLI
# fosse collegata a un altro progetto, il backup legge sempre gym-app.
$ProgettoRef = 'kclgcqwmvqqkogkhycgb'
$QuantiTenere = 8

$Repo   = Split-Path -Parent $PSScriptRoot
$CliJs  = Join-Path $Repo 'node_modules\supabase\dist\supabase.js'
$Prefisso = if ($Locale) { 'gym-app-LOCALE' } else { 'gym-app' }
$Dove     = if ($Locale) { 'database LOCALE di prova' } else { "gym-app ONLINE ($ProgettoRef)" }

function Stop-Backup([string]$Messaggio) {
    Write-Host ''
    Write-Host "BACKUP NON FATTO: $Messaggio" -ForegroundColor Red
    exit 1
}

# Lancia un programma esterno senza che PowerShell 5.1 tratti i suoi
# messaggi informativi come errori. Restituisce il codice di uscita.
function Invoke-Esterno([string]$Programma, [string[]]$Argomenti) {
    $vecchio = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Programma @Argomenti | Out-Host
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $vecchio
    }
}

function Invoke-Supabase([string[]]$Argomenti) {
    $codice = Invoke-Esterno 'node' (@($CliJs) + $Argomenti + @('--workdir', $Repo))
    if ($codice -ne 0) { Stop-Backup "la CLI di Supabase si e' fermata con un errore (codice $codice)." }
}

# Deve restare una lista (non un testo), altrimenti PowerShell la spezza.
$Target = @()
if (-not $Locale) { $Target = @("--remote=$ProgettoRef") }

Write-Host "Backup di gym-app - origine: $Dove" -ForegroundColor Cyan

# --- 1. Controlli prima di iniziare -----------------------------------------
if (-not (Test-Path $CliJs)) { Stop-Backup "manca la CLI di Supabase. Nel repository lancia prima: npm install" }

$vecchio = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
& docker info *> $null; $dockerOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $vecchio
if (-not $dockerOk) { Stop-Backup "Docker Desktop non e' acceso. Aprilo, aspetta che sia pronto e riprova." }

# I backup contengono dati personali: mai dentro un repository git.
$Cartella  = [IO.Path]::GetFullPath($Cartella)
$RepoPieno = (Resolve-Path $Repo).Path.TrimEnd('\') + '\'
if (($Cartella.TrimEnd('\') + '\').StartsWith($RepoPieno, [StringComparison]::OrdinalIgnoreCase)) {
    Stop-Backup "la cartella dei backup e' dentro il repository. Scegline una fuori."
}
if (-not (Test-Path $Cartella)) {
    New-Item -ItemType Directory -Path $Cartella | Out-Null
    Write-Host "Creata la cartella dei backup: $Cartella"
}
$Cartella = (Resolve-Path $Cartella).Path
$vecchio = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
& git -C $Cartella rev-parse --is-inside-work-tree *> $null; $dentroGit = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $vecchio
if ($dentroGit) { Stop-Backup "la cartella dei backup e' dentro un repository git ($Cartella). Scegline una fuori." }

# --- 2. Nomi dei file ---------------------------------------------------------
$Data = Get-Date -Format 'yyyy-MM-dd'
$Base = "${Prefisso}_$Data"
if (Get-ChildItem -Path $Cartella -Filter "${Base}_*" -File -ErrorAction SilentlyContinue) {
    # Secondo backup nello stesso giorno: aggiunge l'ora.
    $Base = "${Prefisso}_${Data}_$(Get-Date -Format 'HHmm')"
    if (Get-ChildItem -Path $Cartella -Filter "${Base}_*" -File -ErrorAction SilentlyContinue) {
        Stop-Backup "esiste gia' un backup di questo minuto. Aspetta un minuto e riprova."
    }
}
$FileStruttura = Join-Path $Cartella "${Base}_struttura.sql"
$FileDati      = Join-Path $Cartella "${Base}_dati.sql"
$TmpStruttura  = "$FileStruttura.parziale"
$TmpDati       = "$FileDati.parziale"

$Utf8 = New-Object System.Text.UTF8Encoding($false)

try {
    # --- 3. Struttura (tabelle, regole di accesso, funzioni) ------------------
    Write-Host ''
    Write-Host '1/3 Salvo la struttura...' -ForegroundColor Cyan
    Invoke-Supabase (@('db', 'dump') + $Target + @('--file', $TmpStruttura))

    # In testa: azzera i permessi "di base" che Supabase da' alle tabelle nuove
    # (anon, authenticated, service_role). Senza queste righe, ripristinando in
    # un progetto nuovo le tabelle avrebbero piu' permessi di gym-app. Piu' sotto
    # il file rimette esattamente i permessi di gym-app (GRANT e DEFAULT PRIVILEGES).
    $testa = "-- Aggiunto da scripts/backup.ps1: azzera i permessi di base prima di creare le tabelle.`n" +
             "ALTER DEFAULT PRIVILEGES FOR ROLE `"postgres`" IN SCHEMA `"public`" REVOKE ALL ON TABLES FROM `"anon`", `"authenticated`", `"service_role`";`n" +
             "ALTER DEFAULT PRIVILEGES FOR ROLE `"postgres`" IN SCHEMA `"public`" REVOKE ALL ON SEQUENCES FROM `"anon`", `"authenticated`", `"service_role`";`n" +
             "ALTER DEFAULT PRIVILEGES FOR ROLE `"postgres`" IN SCHEMA `"public`" REVOKE ALL ON FUNCTIONS FROM `"anon`", `"authenticated`", `"service_role`";`n`n"
    [IO.File]::WriteAllText($TmpStruttura, $testa + [IO.File]::ReadAllText($TmpStruttura, $Utf8), $Utf8)

    # pg_dump non salva due cose che servono per ripristinare bene:
    # - i trigger che le nostre migrazioni mettono sulle tabelle di Supabase
    #   (es. auth.users -> crea il profilo);
    # - l'elenco delle migrazioni gia' applicate.
    # Le leggo (sola lettura) e le aggiungo in fondo al file della struttura.
    $Query = Join-Path $env:TEMP "gym-app-backup-extra-$PID.sql"
    [IO.File]::WriteAllText($Query, @'
select 'trigger' as tipo, pg_get_triggerdef(t.oid) as testo
from pg_trigger t
join pg_class c      on c.oid = t.tgrelid
join pg_namespace n  on n.oid = c.relnamespace
join pg_proc p       on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where n.nspname in ('auth', 'storage')
  and pn.nspname not in ('auth', 'storage')
  and not t.tgisinternal
union all
select 'migrazione', version from supabase_migrations.schema_migrations
order by 1, 2;
'@, $Utf8)
    $vecchio = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $uscita = & node $CliJs db query @Target --read-only --file $Query --output-format json --agent no --workdir $Repo
    $codice = $LASTEXITCODE
    $ErrorActionPreference = $vecchio
    Remove-Item $Query -ErrorAction SilentlyContinue
    if ($codice -ne 0) { Stop-Backup "non riesco a leggere trigger e migrazioni (codice $codice)." }
    $righe = @(($uscita -join "`n") | ConvertFrom-Json) | Where-Object { $_ -and $_.testo }
    $trigger = @($righe | Where-Object { $_.tipo -eq 'trigger' } | ForEach-Object { $_.testo -replace '^CREATE TRIGGER ', 'CREATE OR REPLACE TRIGGER ' })
    $Migrazioni = @($righe | Where-Object { $_.tipo -eq 'migrazione' } | ForEach-Object { $_.testo })
    if ($Migrazioni.Count -lt 1) { Stop-Backup "non trovo l'elenco delle migrazioni applicate." }
    $aggiunta = "`n-- Trigger sulle tabelle di Supabase (auth, storage) creati dalle migrazioni di gym-app.`n" +
                "-- pg_dump non li salva perche' quelle tabelle sono di Supabase: li aggiunge scripts/backup.ps1.`n"
    foreach ($t in $trigger) { $aggiunta += "$t;`n" }
    $aggiunta += "`n-- Migrazioni applicate al momento del backup (vedi docs/backup.md, ripristino):`n" +
                 "-- MIGRAZIONI: $($Migrazioni -join ' ')`n"
    [IO.File]::AppendAllText($TmpStruttura, $aggiunta, $Utf8)

    # --- 4. Dati: schema public (gym-app) e auth (utenti) ----------------------
    # Storage non si salva: gym-app non lo usa e le sue tabelle interne non si
    # possono ripristinare con l'utente postgres.
    Write-Host ''
    Write-Host '2/3 Salvo i dati...' -ForegroundColor Cyan
    Invoke-Supabase (@('db', 'dump') + $Target + @('--data-only', '--use-copy', '--schema', 'public,auth', '--file', $TmpDati))

    # --- 5. Controllo che i file siano completi ------------------------------
    Write-Host ''
    Write-Host '3/3 Controllo i file...' -ForegroundColor Cyan
    if (-not (Select-String -Path $TmpStruttura -SimpleMatch 'CREATE TABLE IF NOT EXISTS "public"."sets"' -Quiet)) {
        Stop-Backup "nel file della struttura manca la tabella public.sets: file incompleto."
    }
    $Conteggi = [ordered]@{}
    $tabella = $null
    foreach ($riga in [IO.File]::ReadLines($TmpDati)) {
        if ($null -eq $tabella) {
            if ($riga -match '^COPY "([^"]+)"\."([^"]+)" .* FROM stdin;$') {
                $tabella = "$($Matches[1]).$($Matches[2])"
                $Conteggi[$tabella] = 0
            }
        } elseif ($riga -eq '\.') {
            $tabella = $null
        } else {
            $Conteggi[$tabella]++
        }
    }
    if (-not $Conteggi.Contains('public.muscles') -or $Conteggi['public.muscles'] -lt 1) {
        Stop-Backup "nel file dei dati mancano i muscoli: file incompleto."
    }

    Move-Item $TmpStruttura $FileStruttura
    Move-Item $TmpDati $FileDati
} finally {
    # Se qualcosa e' andato storto restano solo file .parziale di questo giro: li tolgo.
    foreach ($f in @($TmpStruttura, $TmpDati)) {
        if (Test-Path $f) { Remove-Item $f }
    }
}

# --- 6. Tiene gli ultimi 8 backup ----------------------------------------------
# Tocca SOLO i file con il nome esatto dei backup di questo script.
$Schema = '^' + [regex]::Escape($Prefisso) + '_(\d{4}-\d{2}-\d{2}(?:_\d{4})?)_(struttura|dati)\.sql$'
$FileBackup = @(Get-ChildItem -Path $Cartella -File | Where-Object { $_.Name -match $Schema })
$Giri = @($FileBackup | ForEach-Object { [regex]::Match($_.Name, $Schema).Groups[1].Value } | Sort-Object -Unique -Descending)
$DaTogliere = @($Giri | Select-Object -Skip $QuantiTenere)
foreach ($giro in $DaTogliere) {
    foreach ($f in ($FileBackup | Where-Object { [regex]::Match($_.Name, $Schema).Groups[1].Value -eq $giro })) {
        Remove-Item $f.FullName
        Write-Host "Cancellato backup vecchio: $($f.Name)" -ForegroundColor Yellow
    }
}

# --- 7. Riepilogo -----------------------------------------------------------------
$Principali = @(
    'auth.users', 'public.profiles', 'public.plans', 'public.plan_exercises',
    'public.sessions', 'public.session_exercises', 'public.sets',
    'public.body_metrics', 'public.body_measurements',
    'public.exercises', 'public.machines', 'public.clubs',
    'public.muscles', 'public.set_types'
)
$Totale = 0; foreach ($v in $Conteggi.Values) { $Totale += $v }
$ConDati = @($Conteggi.Keys | Where-Object { $Conteggi[$_] -gt 0 }).Count

Write-Host ''
Write-Host 'BACKUP FATTO' -ForegroundColor Green
Write-Host "Origine:  $Dove"
Write-Host "Cartella: $Cartella"
foreach ($f in @($FileStruttura, $FileDati)) {
    $kb = (Get-Item $f).Length / 1KB
    Write-Host ('  {0,-40} {1,10:N1} KB' -f (Split-Path -Leaf $f), $kb)
}
Write-Host ''
Write-Host 'Righe per tabella principale:'
foreach ($t in $Principali) {
    $n = if ($Conteggi.Contains($t)) { $Conteggi[$t] } else { 0 }
    Write-Host ('  {0,-28} {1,8}' -f $t, $n)
}
Write-Host "Totale: $Totale righe in $ConDati tabelle con dati."
Write-Host "Trigger su tabelle di Supabase aggiunti alla struttura: $($trigger.Count)"
Write-Host "Migrazioni applicate al momento del backup: $($Migrazioni.Count) (l'ultima: $($Migrazioni[-1]))"
Write-Host "Backup nella cartella: $([Math]::Min($Giri.Count, $QuantiTenere)) (si tengono gli ultimi $QuantiTenere)."
