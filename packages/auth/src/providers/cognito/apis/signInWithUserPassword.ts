// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { AuthValidationErrorCode } from '~/src/errors/types/validation';
import { assertServiceError } from '~/src/errors/utils/assertServiceError';
import { assertValidationError } from '~/src/errors/utils/assertValidationError';
import {
	ChallengeName,
	ChallengeParameters,
} from '~/src/providers/cognito/utils/clients/CognitoIdentityProvider/types';
import {
	getActiveSignInUsername,
	getNewDeviceMetatada,
	getSignInResult,
	getSignInResultFromError,
	handleUserPasswordAuthFlow,
	retryOnResourceNotFoundException,
} from '~/src/providers/cognito/utils/signInHelpers';
import { Amplify, Hub } from '@aws-amplify/core';
import {
	AMPLIFY_SYMBOL,
	assertTokenProviderConfig,
} from '@aws-amplify/core/internals/utils';
import { InitiateAuthException } from '~/src/providers/cognito/types/errors';
import {
	CognitoAuthSignInDetails,
	SignInWithUserPasswordInput,
	SignInWithUserPasswordOutput,
} from '~/src/providers/cognito/types';
import {
	cleanActiveSignInState,
	setActiveSignInState,
} from '~/src/providers/cognito/utils/signInStore';
import { cacheCognitoTokens } from '~/src/providers/cognito/tokenProvider/cacheTokens';
import { tokenOrchestrator } from '~/src/providers/cognito/tokenProvider';

import { getCurrentUser } from './getCurrentUser';

/**
 * Signs a user in using USER_PASSWORD_AUTH AuthFlowType
 *
 * @param input - The SignInWithUserPasswordInput object
 * @returns SignInWithUserPasswordOutput
 * @throws service: {@link InitiateAuthException } - Cognito service error thrown during the sign-in process.
 * @throws validation: {@link AuthValidationErrorCode  } - Validation errors thrown when either username or password
 *  are not defined.
 * @throws AuthTokenConfigException - Thrown when the token provider config is invalid.
 */
export async function signInWithUserPassword(
	input: SignInWithUserPasswordInput,
): Promise<SignInWithUserPasswordOutput> {
	const { username, password, options } = input;
	const authConfig = Amplify.getConfig().Auth?.Cognito;
	const signInDetails: CognitoAuthSignInDetails = {
		loginId: username,
		authFlowType: 'USER_PASSWORD_AUTH',
	};
	assertTokenProviderConfig(authConfig);
	const metadata = options?.clientMetadata;
	assertValidationError(
		!!username,
		AuthValidationErrorCode.EmptySignInUsername,
	);
	assertValidationError(
		!!password,
		AuthValidationErrorCode.EmptySignInPassword,
	);

	try {
		const {
			ChallengeName: retryChallengeName,
			ChallengeParameters: retryChallengeParameters,
			AuthenticationResult,
			Session,
		} = await retryOnResourceNotFoundException(
			handleUserPasswordAuthFlow,
			[username, password, metadata, authConfig, tokenOrchestrator],
			username,
			tokenOrchestrator,
		);
		const activeUsername = getActiveSignInUsername(username);
		// sets up local state used during the sign-in process
		setActiveSignInState({
			signInSession: Session,
			username: activeUsername,
			challengeName: retryChallengeName as ChallengeName,
			signInDetails,
		});
		if (AuthenticationResult) {
			await cacheCognitoTokens({
				...AuthenticationResult,
				username: activeUsername,
				NewDeviceMetadata: await getNewDeviceMetatada(
					authConfig.userPoolId,
					AuthenticationResult.NewDeviceMetadata,
					AuthenticationResult.AccessToken,
				),
				signInDetails,
			});
			cleanActiveSignInState();
			Hub.dispatch(
				'auth',
				{
					event: 'signedIn',
					data: await getCurrentUser(),
				},
				'Auth',
				AMPLIFY_SYMBOL,
			);

			return {
				isSignedIn: true,
				nextStep: { signInStep: 'DONE' },
			};
		}

		return getSignInResult({
			challengeName: retryChallengeName as ChallengeName,
			challengeParameters: retryChallengeParameters as ChallengeParameters,
		});
	} catch (error) {
		cleanActiveSignInState();
		assertServiceError(error);
		const result = getSignInResultFromError(error.name);
		if (result) return result;
		throw error;
	}
}
