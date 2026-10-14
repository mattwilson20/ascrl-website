/* Shared navigation behavior; existing page calculations and interactions remain local. */
(() => {
 'use strict';
 const activePage=location.pathname.split('/').pop()||'index.html';
 const current=activePage==='ascrl-concept-03-heritage.html'?'index.html':activePage;
 const holder=document.getElementById('nav-placeholder');
 function setMenu(open,restoreFocus=false){
  const menu=document.getElementById('nav-menu'),button=document.querySelector('[data-h-menu]');
  if(!menu||!button)return;
  menu.hidden=!open;
  button.setAttribute('aria-expanded',String(open));
  if(restoreFocus)button.focus();
 }
 function markCurrent(){
  if(!holder)return;
  holder.querySelectorAll('a[href]').forEach(a=>{
   if(a.getAttribute('href')===current)a.setAttribute('aria-current','page');
   else a.removeAttribute('aria-current');
  });
  const button=holder.querySelector('[data-h-menu]'),menu=holder.querySelector('#nav-menu');
  if(button&&menu)button.setAttribute('aria-expanded',String(!menu.hidden));
 }
 markCurrent();
 if(holder){new MutationObserver(markCurrent).observe(holder,{childList:true,subtree:true});}
 // Existing detail pages already load nav.html. The homepage uses the same source.
 if(holder&&document.body.classList.contains('heritage-home')){
  fetch('nav.html',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Navigation unavailable');return r.text()}).then(html=>{holder.innerHTML=html;markCurrent()}).catch(()=>{/* Keep the fully functional embedded navigation. */});
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-h-menu]')){
   const menu=document.getElementById('nav-menu');setMenu(menu?menu.hidden:false);return;
  }
  if(event.target.closest('#nav-menu a')||!event.target.closest('.h-header'))setMenu(false);
  if(event.target.closest('.rule-header'))queueMicrotask(()=>document.querySelectorAll('.rule-header').forEach(h=>h.setAttribute('aria-expanded',String(h.nextElementSibling?.classList.contains('open')))));
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=document.getElementById('nav-menu');if(menu&&!menu.hidden){event.preventDefault();setMenu(false,true)}}});
 document.querySelectorAll('#copyright-year').forEach(el=>{el.textContent=String(new Date().getFullYear())});
})();
