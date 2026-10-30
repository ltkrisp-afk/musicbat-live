// Inspect the built module contract that production dynamic imports consume.
// This catches a production-only export-mangling failure that dev navigation hid.
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
async function files(root){const result=[];for(const entry of await readdir(root,{withFileTypes:true})){const path=join(root,entry.name);if(entry.isDirectory())result.push(...await files(path));else if(path.endsWith('.js'))result.push(path);}return result;}
const required=['getPrefetchInterceptionContext','navigateClientSide'];let found=null;
for(const path of await files('dist/client')){
 const text=await readFile(path,'utf8');if(!required.every(name=>text.includes(name)))continue;
 const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),names=new Set();
 for(const statement of source.statements)if(ts.isExportDeclaration(statement)&&statement.exportClause&&ts.isNamedExports(statement.exportClause))for(const item of statement.exportClause.elements)names.add(item.name.text);
 const exportedLocals=new Set();
 for(const statement of source.statements)if(ts.isExportDeclaration(statement)&&statement.exportClause&&ts.isNamedExports(statement.exportClause))for(const item of statement.exportClause.elements)exportedLocals.add((item.propertyName??item.name).text);
 // Rolldown may export a namespace object instead of a facade module. The
 // namespace must retain the original keys consumed by the dynamic importer.
 let namespace=false;
 for(const statement of source.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){
  if(!ts.isIdentifier(declaration.name)||!exportedLocals.has(declaration.name.text)||!declaration.initializer||!ts.isCallExpression(declaration.initializer))continue;
  for(const argument of declaration.initializer.arguments)if(ts.isObjectLiteralExpression(argument)){
   const keys=new Set(argument.properties.filter(ts.isPropertyAssignment).map(property=>property.name.getText(source)));
   if(required.every(name=>keys.has(name)))namespace=true;
  }
 }
 if(required.every(name=>names.has(name))||namespace){found=path;break;}
}
assert.ok(found,'Built client is missing the named Vinext navigation exports required by Link dynamic imports.');
console.log('PASS production client navigation export contract:',found);
