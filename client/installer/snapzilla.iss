#define MyAppName "Snapzilla"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Snapzilla"
#define MyAppExeName "Snapzilla.exe"

[Setup]
AppId={{B8F4E2A1-3C5D-4E7F-9A1B-2D3C4E5F6A7B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputBaseFilename=SnapzillaSetup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
SetupIconFile=..\Snapzilla.Client\Assets\snapzilla.ico

[Files]
Source: "..\publish\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Snapzilla starten"; Flags: nowait postinstall skipifsilent
