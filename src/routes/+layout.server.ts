export const load = async ({ locals }) => {
  const authedUser = await locals.getAuthedUser();
  console.log('authedUser', authedUser)
  return {
    authedUser
  }
}