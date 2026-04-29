import { fail, type Actions } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { zod } from 'sveltekit-superforms/adapters';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { signupUsernameEmailDto } from '@/server/api/signup/dtos/signup-username-email.dto';

const signUpDefaults = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  password: '',
  confirm_password: '',
  terms: true,
};

export const load = async (event) => {
  const { parent } = event;
  const { authedUser } = await parent();

  if (authedUser) {
    const message = { type: 'success', message: 'You are already signed in' } as const;
    throw redirect('/', message, event);
  }

  return {
    signupForm: await superValidate(zod(signupUsernameEmailDto), {
      defaults: signUpDefaults,
    }),
  };
};

export const actions: Actions = {
  default: async (event) => {
    const { locals } = event;
    const authedUser = await locals.getAuthedUser();

    if (authedUser) {
      const message = { type: 'success', message: 'You are already signed in' } as const;
      throw redirect('/', message, event);
    }

    const form = await superValidate(event, zod(signupUsernameEmailDto));

    console.log('form data', form.data);

    const { error } = await locals.api.signup.$post({ json: form.data }).then(locals.parseApiResponse);
    if (error) {
      console.log('error', error);
      form.data.password = '';
      form.data.confirm_password = '';
      return setError(form, 'username', 'Unable to sign up.');
    }

    if (!form.valid) {
      form.data.password = '';
      form.data.confirm_password = '';
      return fail(400, {
        form,
      });
    }

    redirect(302, '/');
  },
};
