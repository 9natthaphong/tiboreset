import{state}from"@/lib/demo-store";export const dynamic="force-dynamic";export async function GET(){return Response.json({ok:true,data:state().outbox})}
