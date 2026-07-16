import{state}from"@/lib/demo-store";export async function GET(){return Response.json({ok:true,data:state().forecasts})}
