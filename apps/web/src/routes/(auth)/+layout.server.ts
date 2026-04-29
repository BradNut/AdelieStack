export async function load(event) {
	const { parent } = event;
	const { authedUser } = await parent();

	return {
		authedUser,
	};
}
