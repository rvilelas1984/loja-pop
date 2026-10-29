/* Shared artwork for the student Hall and check-in highlights. */
let hallArtSequence=0;
const hallMetals=[["#8c4728","#f4c58c","#b77443","#ffe2b1"],["#778391","#f7fbff","#b2bdca","#ffffff"],["#9b6815","#fff2a4","#e5b63b","#fff7c5"],["#3b8b9b","#e6ffff","#9ccfd7","#ffffff"],["#65459d","#f2e8ff","#a68be0","#ffffff"]];
const hallFitnessEmojis=[
 ['🚴‍♀️','🔥','🎯','⛰️'],
 ['❤️','⚡','🧠','📈'],
 ['🏋‍♀️','🏃‍♀️','🏁','👑'],
 ['🤸‍♂️','💪','😎','💎'],
 ['⭐','🚀','🦅','🌟']
];
function hallArt(journeyIndex,medalIndex,trophy=false){
 const [dark,light,mid,shine]=hallMetals[journeyIndex],id='hall-metal-'+(++hallArtSequence);
 if(trophy){
  return '<svg class="hall-trophy-sculpture" viewBox="0 0 96 110" role="img" aria-label="Troféu metálico da jornada"><defs><linearGradient id="'+id+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+shine+'"/><stop offset=".20" stop-color="'+light+'"/><stop offset=".52" stop-color="'+mid+'"/><stop offset="1" stop-color="'+dark+'"/></linearGradient></defs><path d="M32 4 46 15 37 29 23 12ZM64 4 50 15 59 29 73 12Z" fill="'+dark+'" opacity=".85"/><path d="M26 29C7 20 6 50 25 59L34 61 34 51C16 52 13 38 25 39ZM70 29C89 20 90 50 71 59L62 61 62 51C80 52 83 38 71 39Z" fill="url(#'+id+')" stroke="'+dark+'" stroke-width="2"/><path d="M24 23H72L68 58Q65 75 48 79Q31 75 28 58Z" fill="url(#'+id+')" stroke="'+dark+'" stroke-width="2"/><path d="M32 30 37 60Q40 68 45 71" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".65"/><path d="M48 34 52 43 62 44 54 51 56 61 48 56 40 61 42 51 34 44 44 43Z" fill="#fff9df" stroke="'+dark+'" stroke-width="1.5"/><rect x="44" y="78" width="8" height="14" rx="2" fill="'+mid+'"/><path d="M29 91H67V98H29Z M22 99H74V107H22Z" rx="3" fill="url(#'+id+')" stroke="'+dark+'" stroke-width="2"/><path d="M9 17 12 9 15 17 23 20 15 23 12 31 9 23 1 20Z M82 9 84 4 86 9 91 11 86 13 84 18 82 13 77 11Z" fill="'+shine+'"/></svg>';
 }
 const emoji=hallFitnessEmojis[journeyIndex][medalIndex];
 return '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="'+id+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+shine+'"/><stop offset=".36" stop-color="'+light+'"/><stop offset=".68" stop-color="'+mid+'"/><stop offset="1" stop-color="'+dark+'"/></linearGradient></defs><path d="M28 5h19l8 28-18 10z" fill="'+dark+'"/><path d="M53 5h19L63 43 45 33z" fill="'+mid+'"/><circle cx="50" cy="60" r="35" fill="url(#'+id+')" stroke="'+dark+'" stroke-width="4"/><circle cx="50" cy="60" r="28" fill="none" stroke="'+shine+'" stroke-width="2"/><text x="50" y="73" font-size="36" text-anchor="middle">'+emoji+'</text></svg>';
}
