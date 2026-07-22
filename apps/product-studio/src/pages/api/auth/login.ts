import type {NextApiRequest,NextApiResponse} from "next";
import {authenticateSalesStudioUser,setSessionCookie} from "@/server/sales-auth";

export default async function handler(req:NextApiRequest,res:NextApiResponse){if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});try{const result=await authenticateSalesStudioUser(String(req.body?.email||""),String(req.body?.password||""));setSessionCookie(res,result.token);return res.status(200).json({ok:true,mustChangePassword:result.mustChangePassword});}catch(error){const status=(error as {statusCode?:number}).statusCode||401;return res.status(status).json({error:status===503?"AUTH_NOT_CONFIGURED":"INVALID_CREDENTIALS"});}}
