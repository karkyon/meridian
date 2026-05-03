"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: error.cause?.err?.message ?? "INVALID_CREDENTIALS" };
    }
    throw error;
  }
}
