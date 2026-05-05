import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default function CleanSignUpPage() {
    return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 p-4">

            {/* Centered Minimalist Logo */}
            <div className="mb-8 flex flex-col items-center">
                <Image
                    src="/athene-logo.png"
                    alt="Athene AI"
                    width={200}
                    height={60}
                    className="object-contain"
                    priority
                />
            </div>

            {/* Clean, Centered Clerk Card */}
            <div className="w-full max-w-[400px]">
                <SignUp
                    routing="path"
                    path="/sign-up"
                    signInUrl="/sign-in"
                    appearance={{
                        elements: {
                            // Standard white card with subtle shadow
                            card: "bg-white shadow-lg border border-slate-200 rounded-xl w-full",
                            headerTitle: "text-2xl font-semibold text-slate-900 tracking-tight",
                            headerSubtitle: "text-sm text-slate-500",

                            // Clean, accessible inputs
                            formFieldInput: "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm",
                            formFieldLabel: "text-sm font-medium text-slate-700",

                            // Professional solid primary button
                            formButtonPrimary: "bg-blue-600 hover:bg-blue-700 h-10 px-4 py-2 rounded-md font-medium w-full text-white transition-colors shadow-sm",

                            // Standard secondary/social buttons
                            socialButtonsBlockButton: "bg-white border border-slate-300 hover:bg-slate-50 h-10 rounded-md text-slate-700 font-medium transition-colors",

                            // Dividers and text
                            dividerLine: "bg-slate-200",
                            dividerText: "text-slate-500 text-xs font-medium",
                            footerActionLink: "text-blue-600 hover:text-blue-700 font-medium",

                            // Internal Clerk text colors for light mode
                            identityPreviewText: "text-slate-900",
                            identityPreviewEditButton: "text-blue-600 hover:text-blue-700",
                            formFieldSuccessText: "text-emerald-600",
                            formFieldErrorText: "text-red-600",
                        },
                    }}
                />
            </div>
        </div>
    );
}