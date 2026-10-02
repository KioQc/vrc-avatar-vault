using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
namespace VRCAvatarVault {
 internal sealed class VaultClient : IDisposable {
  private readonly HttpClient client;
  internal VaultClient(int port,string token){
   if(port<1024||port>65535)throw new ArgumentException("Choose a port from 1024 to 65535");
   client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false,UseProxy=false}){BaseAddress=new Uri("http://127.0.0.1:"+port),Timeout=TimeSpan.FromSeconds(15),MaxResponseContentBufferSize=8*1024*1024};
   client.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",token);
  }
  internal async Task<JObject> Get(string path){using(var response=await client.GetAsync(path)){return await Read(response);}}
  internal async Task<JObject> Post(string path,JObject data){using(var content=new StringContent(data.ToString(),Encoding.UTF8,"application/json"))using(var response=await client.PostAsync(path,content)){return await Read(response);}}
  private static async Task<JObject> Read(HttpResponseMessage response){var raw=await response.Content.ReadAsStringAsync();var json=JObject.Parse(raw);if(!response.IsSuccessStatusCode)throw new Exception((string)json["error"]??"Local API request failed");return json;}
  public void Dispose(){client.Dispose();}
 }
}
