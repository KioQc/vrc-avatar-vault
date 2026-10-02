using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
namespace VRCAvatarVault {
 internal static class SnapshotDiff {
  internal static List<string> Compare(JToken before,JToken after){var result=new List<string>();Walk(before,after,"",result,0);return result;}
  private static void Walk(JToken a,JToken b,string path,List<string> result,int depth){if(JToken.DeepEquals(a,b)||result.Count>=500)return;if(a==null||b==null){result.Add((a==null?"Added ":"Removed ")+path);return;}if(depth>12){result.Add("Changed "+path);return;}if(a is JObject ao&&b is JObject bo){foreach(var k in ao.Properties().Select(p=>p.Name).Union(bo.Properties().Select(p=>p.Name))){if(k=="capturedAt")continue;Walk(ao[k],bo[k],path+"/"+k,result,depth+1);}return;}if(a is JArray aa&&b is JArray ba){var left=Map(aa);var right=Map(ba);foreach(var k in left.Keys.Union(right.Keys)){left.TryGetValue(k,out var x);right.TryGetValue(k,out var y);Walk(x,y,path+"/"+k,result,depth+1);}return;}result.Add((path.EndsWith("/parentId")||path.EndsWith("/path")?"Moved ":"Changed ")+path+": "+a.ToString(Newtonsoft.Json.Formatting.None)+" → "+b.ToString(Newtonsoft.Json.Formatting.None));}
  private static Dictionary<string,JToken> Map(JArray array){var result=new Dictionary<string,JToken>();for(int i=0;i<array.Count;i++){var v=array[i];var k=v is JObject?(string)(v["id"]??v["name"])??i.ToString():i.ToString();if(result.ContainsKey(k))k+="#"+i;result[k]=v;}return result;}
 }
}
