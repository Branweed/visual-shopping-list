// Keeps the app phone-sized even if Chrome's "Desktop site" mode is on.
(function(){var d=document.documentElement;function f(){var sw=screen.width||0,s=Math.min(sw,screen.height||sw),w=window.innerWidth||d.clientWidth,z=1;if(s&&s<700&&w>s*1.5)z=w/sw;d.style.zoom=z>1?String(z):'';d.style.setProperty('--z',z);d.classList.toggle('dz',z>1);}f();addEventListener('resize',f);addEventListener('orientationchange',f);})();
// Light or dark as chosen on the Family tab (no choice = follow the phone).
(function(){try{var t=localStorage.getItem('vsl:theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
