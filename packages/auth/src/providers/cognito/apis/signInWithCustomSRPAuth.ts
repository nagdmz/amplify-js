// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Amplify, Hub } from '@aws-amplify/core';
import {
	AMPLIFY_SYMBOL,
	assertTokenProviderConfig,
} from '@aws-amplify/core/internals/utils';
import { AuthValidationErrorCode } from '~/src/errors/types/validation';
import { assertValidationError } from '~/src/errors/utils/assertValidationError';
import { assertServiceError } from '~/src/errors/utils/assertServiceError';
import {
	getActiveSignInUsername,
	getNewDeviceMetatada,
	getSignInResult,
	getSignInResultFromError,
	handleCustomSRPAuthFlow,
} from '~/src/providers/cognito/utils/signInHelpers';
import {
	InitiateAuthException,
	RespondToAuthChallengeException,
} from '~/src/providers/cognito/types/errors';
import {
	CognitoAuthSignInDetails,
	SignInWithCustomSRPAuthInput,
	SignInWithCustomSRPAuthOutput,
} from '~/src/providers/cognito/types';
import {
	cleanActiveSignInState,
	setActiveSignInState,
} from '~/src/providers/cognito/utils/signInStore';
import { cacheCognitoTokens } from '~/src/providers/cognito/tokenProvider/cacheTokens';
import {
	ChallengeName,
	ChallengeParameters,
} from '~/src/providers/cognito/utils/clients/CognitoIdentityProvider/types';
import { tokenOrchestrator } from '~/src/providers/cognito/tokenProvider';

import { getCurrentUser } from './getCurrentUser';

/**
 * Signs a user in using a custom authentication flow with SRP
 *
 * @param input -  The SignInWithCustomSRPAuthInput object
 * @returns SignInWithCustomSRPAuthOutput
 * @throws service: {@link InitiateAuthException }, {@link RespondToAuthChallengeException } - Cognito
 * service errors thrown during the sign-in process.
 * @throws validation: {@link AuthValidationErrorCode  } - Validation errors thrown when either username or password
 *  are not defined.
 * @throws AuthTokenConfigException - Thrown when the token provider config is invalid.
 */
export async function signInWithCustomSRPAuth(
	input: SignInWithCustomSRPAuthInput,
): Promise<SignInWithCustomSRPAuthOutput> {
	const { username, password, options } = input;
	const signInDetails: CognitoAuthSignInDetails = {
		loginId: username,
		authFlowType: 'CUSTOM_WITH_SRP',
	};
	const authConfig = Amplify.getConfig().Auth?.Cognito;
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
			ChallengeName: handledChallengeName,
			ChallengeParameters: handledChallengeParameters,
			AuthenticationResult,
			Session,
		} = await handleCustomSRPAuthFlow(
			username,
			password,
			metadata,
			authConfig,
			tokenOrchestrator,
		);

		const activeUsername = getActiveSignInUsername(username);
		// sets up local state used during the sign-in process
		setActiveSignInState({
			signInSession: Session,
			username: activeUsername,
			challengeName: handledChallengeName as ChallengeName,
			signInDetails,
		});
		if (AuthenticationResult) {
			await cacheCognitoTokens({
				username: activeUsername,
				...AuthenticationResult,
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
			challengeName: handledChallengeName as ChallengeName,
			challengeParameters: handledChallengeParameters as ChallengeParameters,
		});
	} catch (error) {
		cleanActiveSignInState();
		assertServiceError(error);
		const result = getSignInResultFromError(error.name);
		if (result) return result;
		throw error;
	}
}
