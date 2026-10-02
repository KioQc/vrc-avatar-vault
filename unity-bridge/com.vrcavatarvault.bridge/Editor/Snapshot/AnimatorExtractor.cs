using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEditor;
using UnityEditor.Animations;
namespace VRCAvatarVault {
 internal static class AnimatorExtractor {
  internal static JArray Read(GameObject root,Component descriptor){var controllers=new HashSet<AnimatorController>();foreach(var a in root.GetComponentsInChildren<Animator>(true))Add(a.runtimeAnimatorController,controllers);if(descriptor)using(var so=new SerializedObject(descriptor)){foreach(var field in new[]{"baseAnimationLayers","specialAnimationLayers"}){var p=so.FindProperty(field);if(p!=null&&p.isArray)for(int i=0;i<p.arraySize;i++)Add(p.GetArrayElementAtIndex(i).FindPropertyRelative("animatorController")?.objectReferenceValue as RuntimeAnimatorController,controllers);}}
   var result=new JArray();foreach(var c in controllers.OrderBy(x=>SerializedReader.Id(x))){var parameters=new JArray(c.parameters.Select(p=>new JObject{["name"]=p.name,["type"]=p.type.ToString(),["defaultValue"]=p.type==AnimatorControllerParameterType.Bool?(JToken)new JValue(p.defaultBool):p.type==AnimatorControllerParameterType.Int?new JValue(p.defaultInt):new JValue(p.defaultFloat)}));var layers=new JArray();foreach(var layer in c.layers){var states=new JArray();var transitions=new JArray();States(layer.stateMachine,"",states,transitions,new HashSet<int>());layers.Add(new JObject{["name"]=layer.name,["weight"]=layer.defaultWeight,["blendingMode"]=layer.blendingMode.ToString(),["states"]=states,["transitions"]=transitions});}result.Add(new JObject{["id"]=SerializedReader.Id(c),["name"]=c.name,["parameters"]=parameters,["layers"]=layers});}return result;
  }
  private static void Add(RuntimeAnimatorController c,HashSet<AnimatorController> set){if(c is AnimatorOverrideController ov)c=ov.runtimeAnimatorController;if(c is AnimatorController controller)set.Add(controller);}
  private static JObject Transition(AnimatorTransitionBase t){return new JObject{["id"]=SerializedReader.Id(t),["target"]=t.destinationState?SerializedReader.Id(t.destinationState):SerializedReader.Id(t.destinationStateMachine),["exit"]=t.isExit,["conditions"]=new JArray(t.conditions.Select(c=>new JObject{["parameter"]=c.parameter,["mode"]=c.mode.ToString(),["threshold"]=c.threshold})),["properties"]=SerializedReader.Properties(t)};}
  private static void States(AnimatorStateMachine machine,string prefix,JArray states,JArray transitions,HashSet<int> visited){if(!machine||!visited.Add(machine.GetInstanceID())||visited.Count>512)return;foreach(var t in machine.anyStateTransitions)transitions.Add(new JObject{["from"]=prefix+"Any State",["transition"]=Transition(t)});foreach(var t in machine.entryTransitions)transitions.Add(new JObject{["from"]=prefix+"Entry",["transition"]=Transition(t)});foreach(var child in machine.states){var s=child.state;states.Add(new JObject{["id"]=SerializedReader.Id(s),["name"]=prefix+s.name,["motion"]=SerializedReader.Reference(s.motion),["transitions"]=new JArray(s.transitions.Select(Transition))});}foreach(var sub in machine.stateMachines)States(sub.stateMachine,prefix+sub.stateMachine.name+"/",states,transitions,visited);}
 }
}
