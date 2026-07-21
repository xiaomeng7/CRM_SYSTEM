import type {NextApiRequest,NextApiResponse} from "next";
import {authenticateSingleAdmin,setSessionCookie} from "@/server/sales-auth";

export default function handler(req:NextApiRequest,res:NextApiResponse){if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});try{const token=authenticateSingleAdmin(String(req.body?.email||""),String(req.body?.password||""));setSessionCookie(res,token);return res.status(200).json({ok:true});}catch(error){const status=(error as {statusCode?:number}).statusCode||401;return res.status(status).json({error:status===503?"AUTH_NOT_CONFIGURED":"INVALID_CREDENTIALS"});}}
