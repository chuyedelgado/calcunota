import Link from "next/link";
import Image from "next/image";
import React from 'react';
import {auth, signIn, signOut} from "@/auth"
import { redirect } from "next/dist/server/api-utils";

{/* Investigar que es async y porque solo funciona con server components*/}
const Navbar = async () => {
    {/* declara la sesion*/}
    const session = await auth()

    {/* todo lo className es el css, INCREIBLE*/}
    return(
        <header className='px-5 py-3 bg-white shadow-sm font-work-sans'>
            <nav className='flex justify-between items-center'>
                <Link href="/">
                    <Image src="/logo.png" alt="logo" width={144} height={30} />
                </Link>

                <div className="flex items-center gap-5 text-black">
                    {/* if session exist and session have a user then render this aditional information */}
                    {session && session?.user ? (
                        <>
                            <form action={async ()=> {
                                "use server";

                                await signOut({ redirectTo: "/" });
                            }}>
                                <button type="submit">Logout</button>
                            </form>

                            <Link href={'/user/${session?.id}'}>
                                <span>{session?.user?.name}</span>
                            </Link>
                        </>
                    ) : (
                        <form action={async ()=> {
                            "use server";

                            await signIn("google")
                        }}>
                            <button type="submit">
                                Login
                            </button>
                        </form>
                    )}
                </div>
            </nav>
        </header>
    )
}

export default Navbar