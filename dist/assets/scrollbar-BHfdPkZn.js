import{i as e,t}from"./jsx-runtime-CB-XP10L.js";import{i as n}from"./sounds-Rz78j7cB.js";var r=e(),i=t(),a=10;function o(e,t){if(!t?.length)return e;let n=[];for(let r of t){let t=0;for(;t<e.length;){let i=e.indexOf(r.text,t);if(i===-1)break;n.push({start:i,end:i+r.text.length,href:r.href}),t=i+r.text.length}}n.sort((e,t)=>e.start-t.start);let r=[],a=0;return n.forEach((t,n)=>{t.start<a||(t.start>a&&r.push(e.slice(a,t.start)),r.push((0,i.jsx)(`a`,{href:t.href,target:`_blank`,rel:`noopener noreferrer`,children:e.slice(t.start,t.end)},n)),a=t.end)}),a<e.length&&r.push(e.slice(a)),r}function s(e,t){let n=e[t];return!n||/\s/.test(n)?!1:t===0||/\s/.test(e[t-1])}function c({as:e=`span`,text:t,active:c=!0,speedMs:l=a,caret:u=!0,playTypeSound:d=!1,hold:f=!1,className:p,links:m,onComplete:h,...g}){let _=e,[v,y]=(0,r.useState)(c||f?``:t),[b,x]=(0,r.useState)(!c&&!f),S=[`typewriter-reveal`,p].filter(Boolean).join(` `),C=(0,r.useRef)(h);C.current=h;let w=(0,r.useMemo)(()=>window.matchMedia?.(`(prefers-reduced-motion: reduce)`)?.matches??!1,[]);return(0,r.useEffect)(()=>{if(!c){y(f?``:t),x(!f);return}if(w){y(t),x(!0),C.current?.();return}y(``),x(!1);let e=0,r=window.setInterval(()=>{let i=e;e+=1,y(t.slice(0,e)),d&&s(t,i)&&n(`hover`,!0),e>=t.length&&(window.clearInterval(r),x(!0),C.current?.())},l);return()=>window.clearInterval(r)},[c,f,d,w,l,t]),(0,i.jsxs)(_,{className:S,...g,children:[(0,i.jsx)(`span`,{className:`typewriter-reveal__ghost`,"aria-hidden":!0,children:o(t,m)}),(0,i.jsxs)(`span`,{className:`typewriter-reveal__live`,children:[o(v,m),u&&!b?(0,i.jsx)(`span`,{className:`typewriter-reveal__caret`,"aria-hidden":!0}):null]})]})}var l=`mozayk_stats_page_view_sent`;function u(){return``}function d(e){let t=u();t&&fetch(t,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({event:e}),keepalive:!0,mode:`cors`}).catch(()=>{})}function f(){try{if(sessionStorage.getItem(l)===`1`)return;sessionStorage.setItem(l,`1`)}catch{}d(`page_view`)}function p(){d(`visual_exported`)}var m=`mozayk-scrollbar`,h=`
* {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

*::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 0;
}

*::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

*::-webkit-scrollbar-corner {
  background: transparent;
}
`;function g(){if(document.getElementById(m))return;let e=document.createElement(`style`);e.id=m,e.textContent=h,document.head.appendChild(e)}export{c as a,u as i,f as n,p as r,g as t};