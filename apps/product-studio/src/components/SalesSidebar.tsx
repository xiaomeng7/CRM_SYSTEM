import Link from "next/link";

export default function SalesSidebar({active,email,role}:{active:"overview"|"configure"|"customers"|"proposals"|"users";email?:string|null;role?:string|null}){
  return <aside className="sales-nav">
    <Link href="/sales" className="sales-brand">BETTER HOME</Link>
    <p>SALES STUDIO</p>
    <nav>
      <Link className={active==="overview"?"active":""} href="/sales">Overview</Link>
      <Link className={active==="configure"?"active":""} href="/configure">New selection</Link>
      <Link className={active==="customers"?"active":""} href="/sales/customers">Customers</Link>
      <Link className={active==="proposals"?"active":""} href="/sales/proposals">Proposals</Link>
      {role==="ADMIN"?<Link className={active==="users"?"active":""} href="/admin/users">User management</Link>:null}
    </nav>
    {email?<footer><b>{email}</b><span>{role}</span><Link href="/account/password">Change password</Link><Link href="/logout">Sign out</Link></footer>:null}
  </aside>;
}
