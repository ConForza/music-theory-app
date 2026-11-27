import "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the type parameter must match React's declaration to merge with it
  interface InputHTMLAttributes<T> {
    /** Safari's password-generation rules (https://developer.apple.com/password-rules/); passed through to the DOM as is. */
    passwordrules?: string;
  }
}
