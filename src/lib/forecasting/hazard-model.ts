import type { Features,ModelConfig } from "./types";
export const sigmoid=(x:number)=>1/(1+Math.exp(-x));
export const intervalHazard=(features:Features,config:ModelConfig,coefficients?:Record<string,number>)=>sigmoid(config.intercept+Object.entries(features).reduce((s,[k,v])=>s+v*(coefficients?.[k]??config.coefficients[k as keyof Features].mean),0));
export const horizonProbabilityFromHazards=(hazards:number[])=>1-hazards.reduce((survival,h)=>survival*(1-h),1);
export const horizonProbability=(features:Features,config:ModelConfig,horizonHours:number,coefficients?:Record<string,number>)=>horizonProbabilityFromHazards(Array.from({length:Math.ceil(horizonHours/config.intervalsHours)},()=>intervalHazard(features,config,coefficients)));
export const boundedProbability=(p:number,confirmed=false)=>confirmed?Math.min(.995,Math.max(0,p)):Math.min(.97,Math.max(.01,p));
