using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;
namespace VRCAvatarVault {
 // Serialized, read-only inspection: no VRCFury upgrade/build method is called.
 internal static class VrcFuryExtractor {
  internal static JObject Read(GameObject root) {
   var components=new JArray();var parameters=new JArray();var menus=new JArray();var warnings=new JArray();
   foreach(var component in root.GetComponentsInChildren<Component>(true)) {
    if(!component || component.GetType().FullName!="VF.Model.VRCFury")continue;
    var refs=new JArray();var declarations=new JArray();var seen=new HashSet<int>();
    using(var so=new SerializedObject(component)) {
     var p=so.GetIterator();int count=0;
     while(p.Next(true)) {
      if(++count>12000){warnings.Add("VRCFury component inspection reached its property limit: "+AvatarExtractor.PathOf(component.transform,root.transform));break;}
      if(p.propertyPath!="content"&&!p.propertyPath.StartsWith("content.",StringComparison.Ordinal)&&!p.propertyPath.StartsWith("config.features.",StringComparison.Ordinal))continue;
      if(p.propertyType==SerializedPropertyType.ManagedReference && p.managedReferenceFullTypename.EndsWith(".Toggle",StringComparison.Ordinal)) {
       declarations.Add(new JObject{["feature"]="Toggle",["menuPath"]=SerializedReader.Value(p.FindPropertyRelative("name")),["slider"]=SerializedReader.Value(p.FindPropertyRelative("slider")),["saved"]=SerializedReader.Value(p.FindPropertyRelative("saved")),["useGlobalParam"]=SerializedReader.Value(p.FindPropertyRelative("useGlobalParam")),["globalParam"]=SerializedReader.Value(p.FindPropertyRelative("globalParam")),["defaultOn"]=SerializedReader.Value(p.FindPropertyRelative("defaultOn")),["defaultSliderValue"]=SerializedReader.Value(p.FindPropertyRelative("defaultSliderValue")),["basis"]="Authored declaration; generated parameter name is determined by VRCFury at build"});
      }
      Object asset=null;
      if(p.propertyType==SerializedPropertyType.ObjectReference)asset=p.objectReferenceValue;
      // VRCFury GuidWrapper can retain an ID while its object reference is null.
      if(p.propertyType==SerializedPropertyType.String&&p.name=="id") {
       var parts=p.stringValue.Split(':');
       if(parts.Length==2&&long.TryParse(parts[1],out var localId)) {
        var assetPath=AssetDatabase.GUIDToAssetPath(parts[0]);
        if(!string.IsNullOrEmpty(assetPath))foreach(var candidate in AssetDatabase.LoadAllAssetsAtPath(assetPath)) {
         if(candidate&&AssetDatabase.TryGetGUIDAndLocalFileIdentifier(candidate,out string guid,out long fileId)&&fileId==localId){asset=candidate;break;}
        }
       }
      }
      if(!asset||!seen.Add(asset.GetInstanceID()))continue;
      var type=asset.GetType().Name;var source=AvatarExtractor.PathOf(component.transform,root.transform);
      if(type!="VRCExpressionsMenu"&&type!="VRCExpressionParameters")continue;
      refs.Add(new JObject{["type"]=type,["path"]=AssetDatabase.GetAssetPath(asset),["property"]=p.propertyPath});
      if(type=="VRCExpressionParameters"&&ExpressionExtractor.ParametersAsset(asset) is JArray values)foreach(JObject value in values){value["sourceObject"]=source;value["assetPath"]=AssetDatabase.GetAssetPath(asset);parameters.Add(value);}
      if(type=="VRCExpressionsMenu")foreach(JObject value in ExpressionExtractor.MenusAsset(asset)){value["sourceObject"]=source;if(value["assetPath"]==null)value["assetPath"]=AssetDatabase.GetAssetPath(asset);menus.Add(value);}
     }
    }
    components.Add(new JObject{["id"]=SerializedReader.Id(component),["path"]=AvatarExtractor.PathOf(component.transform,root.transform),["enabled"]=(component as Behaviour)?.enabled,["activeInHierarchy"]=component.gameObject.activeInHierarchy,["references"]=refs,["declarations"]=declarations});
   }
   return new JObject{["basis"]="Authored VRCFury inputs; before build merging and generated parameters",["components"]=components,["parameters"]=parameters,["menus"]=menus,["warnings"]=warnings,["generatedOutputCaptured"]=false};
  }
 }
}
