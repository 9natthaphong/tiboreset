import{resetDemo}from"@/lib/demo-store";export async function POST(){resetDemo();return Response.json({ok:true})}
