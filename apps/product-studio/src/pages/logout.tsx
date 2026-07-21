import type {GetServerSideProps} from "next";
import {clearSessionCookie} from "@/server/sales-auth";

export default function Logout(){return null;}
export const getServerSideProps:GetServerSideProps=async context=>{clearSessionCookie(context.res);return {redirect:{destination:"/login",permanent:false}};};
