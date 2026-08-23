// Must stay in sync with COLLEGE_EMAIL_DOMAIN on the backend (see .env.example).
export const COLLEGE_EMAIL_DOMAIN = '@iames.mans.edu.eg';

export function buildCollegeEmail(collegeId: string): string {
  return `${collegeId}${COLLEGE_EMAIL_DOMAIN}`;
}
