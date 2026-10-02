using System;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using Object=UnityEngine.Object;
namespace VRCAvatarVault {
 internal static class SerializedReader {
  internal static string Id(Object obj){if(!obj)return null;var id=GlobalObjectId.GetGlobalObjectIdSlow(obj);return id.targetObjectId==0?"session:"+obj.GetInstanceID():id.ToString();}
  internal static JObject Reference(Object obj){return obj?new JObject{["id"]=Id(obj),["name"]=obj.name,["asset"]=AssetDatabase.GetAssetPath(obj)}:null;}
  internal static JToken Value(SerializedProperty p){if(p==null)return JValue.CreateNull();switch(p.propertyType){
   case SerializedPropertyType.Boolean:return new JValue(p.boolValue);
   case SerializedPropertyType.Integer:return new JValue(p.longValue);
   case SerializedPropertyType.Float:return double.IsNaN(p.doubleValue)||double.IsInfinity(p.doubleValue)?JValue.CreateNull():new JValue(p.doubleValue);
   case SerializedPropertyType.String:return new JValue(p.stringValue);
   case SerializedPropertyType.Enum:return new JValue(p.enumValueIndex>=0&&p.enumValueIndex<p.enumNames.Length?p.enumNames[p.enumValueIndex]:p.intValue.ToString());
   case SerializedPropertyType.ObjectReference:return (JToken)Reference(p.objectReferenceValue)??JValue.CreateNull();
   case SerializedPropertyType.Vector3:return new JObject{["x"]=p.vector3Value.x,["y"]=p.vector3Value.y,["z"]=p.vector3Value.z};
   case SerializedPropertyType.Vector2:return new JObject{["x"]=p.vector2Value.x,["y"]=p.vector2Value.y};
   case SerializedPropertyType.Quaternion:return new JObject{["x"]=p.quaternionValue.x,["y"]=p.quaternionValue.y,["z"]=p.quaternionValue.z,["w"]=p.quaternionValue.w};
   case SerializedPropertyType.Color:return new JValue(p.colorValue.ToString());
   default:return JValue.CreateNull();
  }}
  internal static JObject Properties(Object obj){var result=new JObject();if(!obj)return result;using(var so=new SerializedObject(obj)){var p=so.GetIterator();int count=0;bool enter=true;while(p.NextVisible(enter)){enter=p.depth<3&&(!p.isArray||p.arraySize<=64);if(p.propertyPath=="m_Script")continue;if(++count>512){result["_truncated"]=true;break;}if(p.propertyType!=SerializedPropertyType.Generic)result[p.propertyPath]=Value(p);}}return result;}
  internal static Object ObjectField(Object obj,string name){if(!obj)return null;using(var so=new SerializedObject(obj)){return so.FindProperty(name)?.objectReferenceValue;}}
 }
}
