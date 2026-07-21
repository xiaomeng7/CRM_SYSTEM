import type {NextApiRequest,NextApiResponse} from "next";
import {clearSessionCookie} from "@/server/sales-auth";

export default function handler(req:NextApiRequest,res:NextApiResponse){if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});clearSessionCookie(res);return res.status(200).json({ok:true});}
