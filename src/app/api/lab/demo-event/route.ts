import{injectDemoEvent}from"@/lib/demo-store";export async function POST(){return Response.json({ok:true,data:injectDemoEvent()})}
