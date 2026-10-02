using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;
namespace VRCAvatarVault {
 public sealed class AvatarVaultWindow : EditorWindow {
  private int port=17861,localIndex,remoteIndex;private string token="",status="Disconnected",changeTitle="",description="",version="",snapshotLabel="Unity snapshot",desktopExe="";
  private bool busy,connected,includeUnreleased,includeSnapshot=true,includeBaseline,watch;private double nextHeartbeat,lastEdit,nextAnalysis;private bool dirty;
  private Component[] local=Array.Empty<Component>();private JObject[] remote=Array.Empty<JObject>();private string platform="PC";
  private JObject captured,previous;private List<string> differences=new List<string>();private Vector2 scroll;private VaultClient client;
  [MenuItem("Tools/VRC Avatar Vault")]
  public static void ShowWindow(){GetWindow<AvatarVaultWindow>("VRC Avatar Vault");}
  private void OnEnable(){port=EditorPrefs.GetInt("VRCAvatarVault.Port",17861);Refresh();EditorApplication.update+=Tick;EditorApplication.hierarchyChanged+=Changed;EditorApplication.projectChanged+=Changed;Undo.postprocessModifications+=Modified;}
  private void OnDisable(){EditorApplication.update-=Tick;EditorApplication.hierarchyChanged-=Changed;EditorApplication.projectChanged-=Changed;Undo.postprocessModifications-=Modified;client?.Dispose();client=null;token="";connected=false;}
  private UndoPropertyModification[] Modified(UndoPropertyModification[] changes){Changed();return changes;}
  private void Changed(){dirty=true;lastEdit=EditorApplication.timeSinceStartup;}
  private Component Selected=>localIndex>=0&&localIndex<local.Length?local[localIndex]:null;
  private string RemoteId=>remoteIndex>=0&&remoteIndex<remote.Length?(string)remote[remoteIndex]["id"]:null;
  private void Refresh(){local=AvatarExtractor.Avatars();localIndex=Mathf.Clamp(localIndex,0,Math.Max(0,local.Length-1));}
  private async Task Run(Func<Task> work){if(busy)return;busy=true;try{await work();}catch(Exception e){status=e.Message;}finally{busy=false;Repaint();}}
  private async void Tick(){if(!this)return;var now=EditorApplication.timeSinceStartup;if(connected&&!busy&&now>=nextHeartbeat){nextHeartbeat=now+10;await Run(async()=>{try{await client.Post("/api/v1/presence",new JObject{["protocolVersion"]=1,["project"]=new DirectoryInfo(Path.GetDirectoryName(Application.dataPath)).Name,["scene"]=SceneManager.GetActiveScene().name,["avatar"]=Selected?Selected.name:""});}catch{connected=false;throw;}});}if(watch&&dirty&&!busy&&!EditorApplication.isPlaying&&now-lastEdit>=3&&now>=nextAnalysis){nextAnalysis=now+10;dirty=false;try{Analyze();}catch(Exception e){status=e.Message;}Repaint();}}
  private async Task Connect(){client?.Dispose();client=new VaultClient(port,token);var response=await client.Get("/api/v1/status");if((int?)response["protocolVersion"]!=1)throw new Exception("Incompatible desktop protocol. Unity Bridge requires protocol v1.");var list=await client.Get("/api/v1/avatars");remote=((JArray)list["avatars"]).OfType<JObject>().ToArray();remoteIndex=Mathf.Clamp(remoteIndex,0,Math.Max(0,remote.Length-1));connected=true;status="Connected · Desktop "+(string)response["appVersion"]+" · Protocol v1";EditorPrefs.SetInt("VRCAvatarVault.Port",port);}
  private void Analyze(){if(!Selected)throw new Exception("Select a scene avatar first");captured=AvatarExtractor.Capture(Selected,platform);differences=previous==null?new List<string>{"First analysis: capture a snapshot to establish the comparison baseline."}:SnapshotDiff.Compare(previous,captured);status="Analyzed: "+differences.Count+" changes. No avatar assets were modified.";}
  private string PathFor(string operation){if(string.IsNullOrEmpty(RemoteId))throw new Exception("Select a desktop tracker");return "/api/v1/avatars/"+Uri.EscapeDataString(RemoteId)+"/"+operation;}
  private bool CheckAssociation(){var blueprint=(string)captured?["blueprintId"];var linked=remoteIndex<remote.Length?(string)remote[remoteIndex]["vrchatId"]:null;return string.IsNullOrEmpty(blueprint)||string.IsNullOrEmpty(linked)||blueprint==linked||EditorUtility.DisplayDialog("Different avatar association","The scene blueprint ID differs from the selected tracker. Send this explicitly selected snapshot anyway?","Send snapshot","Cancel");}
  private async Task SendSnapshot(string releaseId=null){Analyze();if(!CheckAssociation())throw new OperationCanceledException("Snapshot cancelled; release follow-up remains pending.");await client.Post(PathFor("snapshots"),new JObject{["label"]=snapshotLabel,["releaseId"]=releaseId,["data"]=captured});previous=(JObject)captured.DeepClone();differences.Clear();status="Snapshot saved in Avatar Vault";}
  private string pendingReleaseId,pendingAvatar,pendingVersion;private bool pendingSnapshot,pendingBaseline;
  private async Task MarkVersion(){
   if(pendingReleaseId!=null&&(pendingAvatar!=RemoteId||pendingVersion!=version))throw new Exception("Finish the pending release for the previous tracker/version first.");
   if(pendingReleaseId==null){
    if(includeSnapshot){Analyze();if(!CheckAssociation())return;}
    var result=await client.Post(PathFor("releases"),new JObject{["title"]=changeTitle,["version"]=version,["description"]=description,["includeUnreleased"]=includeUnreleased});
    pendingReleaseId=(string)result["id"];pendingAvatar=RemoteId;pendingVersion=version;pendingSnapshot=includeSnapshot;pendingBaseline=includeBaseline;
   }
   status="Release v"+version+" saved. Retrying this action only finishes pending snapshots.";
   if(pendingSnapshot){await SendSnapshot(pendingReleaseId);pendingSnapshot=false;}
   if(pendingBaseline){await client.Post(PathFor("baselines"),new JObject{["label"]="Baseline v"+version,["releaseId"]=pendingReleaseId});pendingBaseline=false;}
   pendingReleaseId=null;await Connect();status="Release v"+version+" completed";
  }
  private void OnGUI(){scroll=EditorGUILayout.BeginScrollView(scroll);EditorGUILayout.LabelField("VRC Avatar Vault — Unity Bridge 0.1.0",EditorStyles.boldLabel);EditorGUILayout.HelpBox(status,MessageType.Info);
   port=EditorGUILayout.IntField("Local API port",port);token=EditorGUILayout.PasswordField("Integration token",token);EditorGUILayout.HelpBox("Enable the local API in desktop Settings and paste its token. Token is kept only in memory and cleared when this window closes. No VRChat password is used.",MessageType.None);
   using(new EditorGUI.DisabledScope(busy||string.IsNullOrWhiteSpace(token))){if(GUILayout.Button("Connect / refresh desktop trackers"))_ = Run(Connect);}
   if(GUILayout.Button("Refresh scene avatars"))Refresh();
   if(local.Length==0)EditorGUILayout.HelpBox("No VRCAvatarDescriptor found in loaded scenes.",MessageType.Warning);else{EditorGUI.BeginChangeCheck();localIndex=EditorGUILayout.Popup("Scene avatar",localIndex,local.Select(c=>c?c.name:"Missing").ToArray());if(EditorGUI.EndChangeCheck()){captured=null;previous=null;differences.Clear();}}
   if(remote.Length>0)remoteIndex=EditorGUILayout.Popup("Desktop tracker",remoteIndex,remote.Select(a=>(string)a["name"]+" · v"+(string)a["version"]).ToArray());
   platform=new[]{"PC","Quest","iOS","Unknown"}[EditorGUILayout.Popup("Snapshot platform",Array.IndexOf(new[]{"PC","Quest","iOS","Unknown"},platform),new[]{"PC","Quest","iOS","Unknown"})];
   EditorGUILayout.HelpBox("Read-only authored-scene analysis. Build optimizers may change actual uploaded metrics. Save your scene for stable object IDs.",MessageType.None);
   watch=EditorGUILayout.Toggle("Watch selected avatar",watch);snapshotLabel=EditorGUILayout.TextField("Snapshot label",snapshotLabel);
   using(new EditorGUI.DisabledScope(busy||!Selected)){if(GUILayout.Button("Analyze / preview differences")){try{Analyze();}catch(Exception e){status=e.Message;}}if(GUILayout.Button("Export snapshot JSON…")){try{Analyze();var path=EditorUtility.SaveFilePanel("Export snapshot","","avatar-snapshot","json");if(!string.IsNullOrEmpty(path))File.WriteAllText(path,captured.ToString());}catch(Exception e){status=e.Message;}}}
   using(new EditorGUI.DisabledScope(busy||!connected||!Selected||string.IsNullOrEmpty(RemoteId))){if(GUILayout.Button("Create snapshot in desktop"))_ = Run(()=>SendSnapshot());}
   if(captured!=null){EditorGUILayout.LabelField("Metrics",EditorStyles.boldLabel);EditorGUILayout.SelectableLabel(captured["metrics"].ToString(),GUILayout.Height(150));}
   EditorGUILayout.LabelField("Changes detected",EditorStyles.boldLabel);foreach(var line in differences.Take(100))EditorGUILayout.LabelField(line,EditorStyles.wordWrappedLabel);
   if(differences.Count>0&&GUILayout.Button("Suggest changelog draft (does not send)")){changeTitle=differences.Any(d=>d.Contains("/parameters")||d.Contains("/controllers"))?"Updated expression and animation system":differences.Any(d=>d.Contains("/materials")||d.Contains("/textures"))?"Updated avatar materials and textures":"Updated avatar configuration";description="Suggested from analysis:\n"+string.Join("\n",differences.Take(50));}
   EditorGUILayout.Space();EditorGUILayout.LabelField("Changelog / release",EditorStyles.boldLabel);changeTitle=EditorGUILayout.TextField("Title",changeTitle);description=EditorGUILayout.TextArea(description,GUILayout.MinHeight(60));version=EditorGUILayout.TextField("Exact release version",version);
   using(new EditorGUI.DisabledScope(busy||!connected||string.IsNullOrEmpty(RemoteId))){if(GUILayout.Button("Add reviewed changelog"))_ = Run(async()=>{await client.Post(PathFor("changes"),new JObject{["title"]=changeTitle,["description"]=description,["category"]="Changed"});status="Changelog added to Unreleased";});includeUnreleased=EditorGUILayout.Toggle("Include all unreleased changes",includeUnreleased);includeSnapshot=EditorGUILayout.Toggle("Capture Unity snapshot",includeSnapshot);includeBaseline=EditorGUILayout.Toggle("Capture linked project baseline",includeBaseline);if(GUILayout.Button("Mark version / create release")){if(EditorUtility.DisplayDialog("Create local release?","Create v"+version+" for "+(remoteIndex<remote.Length?(string)remote[remoteIndex]["name"]:"")+"? No upload or VRChat rename will be performed.","Create release","Cancel"))_ = Run(MarkVersion);}if(GUILayout.Button("Start desktop work session"))_ = Run(async()=>{await client.Post(PathFor("sessions"),new JObject{["description"]=description});status="Work session started; pause or stop it in desktop";});if(GUILayout.Button("Open in Avatar Vault"))_ = Run(async()=>{await client.Post(PathFor("open"),new JObject());status="Desktop navigation requested";});}
   EditorGUILayout.Space();if(GUILayout.Button("Choose desktop executable…"))desktopExe=EditorUtility.OpenFilePanel("Choose VRC Avatar Vault executable","","exe");using(new EditorGUI.DisabledScope(!File.Exists(desktopExe))){if(GUILayout.Button("Launch desktop app")){try{System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(desktopExe){UseShellExecute=true});}catch(Exception e){status=e.Message;}}}
   EditorGUILayout.EndScrollView();
  }
 }
}
