// Authored places are shared with camera/clearance QA. They stay fixed when a
// tablet rotates; looking around reveals another place, never a screen slot.
export const trailZ=x=>4.8+Math.sin(x*.073)*1.7;
export function shorelineZ(x,groundHeight,waterY=-.045){
  let best=-2.6,distance=Infinity;
  for(let z=-6;z<=1.5;z+=.12){const d=Math.abs(groundHeight(x,z)-(waterY+.04));if(d<distance){distance=d;best=z;}}
  return best;
}
export const CANOPY_HUNT=Object.freeze({
  maxYaw:.95,maxPitch:.40,
  leaves:[{x:.2,y:-.9,z:6.5,scale:.70},{x:-8.5,y:-.35,z:4.1,scale:.66},{x:8.2,y:-1,z:4,scale:.68}],
  beetle:{x:-7.75,y:-1.55,z:5.6,scale:.42},
});
export const WIND_HUNT=Object.freeze({phases:[.18,.48,.78],maxInteractDistance:18});
export const GROUND_HUNTS=Object.freeze({
  trex:{camera:[37,4.8,14.1],target:[37,.2,trailZ(37)],points:[[37,trailZ(37)],[24,trailZ(24)],[50,trailZ(50)]],secret:[25,3.55],maxYaw:1.10,maxPitch:.23},
  spinosaurus:{camera:[65,4.8,-3],target:[65,0,-8],points:[[65,-8],[51,-8],[77,-9.5]],secret:[80.6,-5],maxYaw:1.40,maxPitch:.24},
  parasaurolophus:{camera:[67,4.2,-10.2],target:[67,.8,-2.6],points:[[67,-2.6],[54,-2.6],[79,-2.6]],secret:[77.6,-2.6],maxYaw:1.18,maxPitch:.26},
  brachiosaurus:{camera:[28.7,8.9,20.8],target:[25.7,1.5,-1.2],secret:[29.8,-4.16],maxYaw:1.05,maxPitch:.35},
  pteranodon:{camera:[82.1,3.6,4],target:[80,.8,-4],secret:[86.5,-5.4],maxYaw:1.1,maxPitch:.28},
});
