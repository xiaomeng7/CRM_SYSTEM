import {useState} from "react";
import type {InputHTMLAttributes} from "react";

type Props=InputHTMLAttributes<HTMLInputElement>;

export default function PasswordField(props:Props){
  const [visible,setVisible]=useState(false);
  return <span className="password-field">
    <input {...props} type={visible?"text":"password"}/>
    <button type="button" className="password-visibility" onClick={()=>setVisible(value=>!value)} aria-label={visible?"Hide password":"Show password"} aria-pressed={visible}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>
    </button>
  </span>;
}
