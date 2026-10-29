const MAX_UPLOAD=80*1024*1024;
const text=(v,n=160)=>typeof v==='string'&&v.length<=n;
function validMessage(m){
 if(!m||typeof m!=='object'||Array.isArray(m))return false;
 const unit=v=>Number.isFinite(v)&&v>=0&&v<=1;
 switch(m.type){
 case 'pointer':return ['down','move','up','cancel'].includes(m.phase)&&unit(m.x)&&unit(m.y)&&['mouse','touch','pen'].includes(m.pointerType)&&Number.isInteger(m.pointerId)&&[-1,0,1,2].includes(m.button);
 case 'wheel':return unit(m.x)&&unit(m.y)&&Number.isFinite(m.deltaX)&&Math.abs(m.deltaX)<=10000&&Number.isFinite(m.deltaY)&&Math.abs(m.deltaY)<=10000;
 case 'key':return text(m.key,32)&&['down','up'].includes(m.phase)&&!['F5','F11','F12','Meta','OS'].includes(m.key);
 case 'resize':return Number.isInteger(m.width)&&m.width>=390&&m.width<=1600&&Number.isInteger(m.height)&&m.height>=600&&m.height<=1000;
 case 'field':return text(m.id,100)&&text(m.value,20000);
 case 'control':return text(m.id,100);
 case 'upload-cancel':return text(m.id,100);
 case 'upload-start':return text(m.id,100)&&text(m.name,180)&&/\.(png|jpe?g|webp|svg|tga|json)$/i.test(m.name)&&Number.isInteger(m.size)&&m.size>0&&m.size<=MAX_UPLOAD&&text(m.mime,100);
 case 'upload-end':case 'backup':return true;
 case 'restore':return typeof m.id==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(m.id);
 default:return false;
 }
}
function validTGA(name,data){
 if(!/^car_(?:num_|spec_)?[0-9]+\.tga$/.test(name)||!Buffer.isBuffer(data)||data.length<18||data.length>20*1024*1024||data[0]!==0||data[1]!==0||![2,10].includes(data[2])||data.readUInt16LE(12)!==2048||data.readUInt16LE(14)!==2048||data[16]!==24||data[17]!==32)return false;
 const pixels=2048*2048;if(data[2]===2)return data.length===18+pixels*3;
 let offset=18,count=0;while(offset<data.length&&count<pixels){const packet=data[offset++],size=(packet&127)+1;count+=size;offset+=(packet&128)?3:size*3;if(count>pixels||offset>data.length)return false;}
 return count===pixels&&offset===data.length;
}
function editorMessage(type,data){return {...data,...(type==='field'?{inputType:data.type}:{}),type};}
module.exports={validMessage,validTGA,editorMessage,MAX_UPLOAD};
