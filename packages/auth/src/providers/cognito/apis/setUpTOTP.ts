// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Amplify, fetchAuthSession } from '@aws-amplify/core';
import {
	AuthAction,
	assertTokenProviderConfig,
} from '@aws-amplify/core/internals/utils';
import { AuthError } from '~/src/errors/AuthError';
import {
	AssociateSoftwareTokenException,
	SETUP_TOTP_EXCEPTION,
} from '~/src/providers/cognito/types/errors';
import { SetUpTOTPOutput } from '~/src/providers/cognito/types';
import { getTOTPSetupDetails } from '~/src/providers/cognito/utils/signInHelpers';
import { associateSoftwareToken } from '~/src/providers/cognito/utils/clients/CognitoIdentityProvider';
import { getRegion } from '~/src/providers/cognito/utils/clients/CognitoIdentityProvider/utils';
import { assertAuthTokens } from '~/src/providers/cognito/utils/types';
import { getAuthUserAgentValue } from '~/src/utils';

/**
 * Sets up TOTP for the user.
 *
 * @returns SetUpTOTPOutput
 * @throws -{@link AssociateSoftwareTokenException}
 * Thrown if a service occurs while setting up TOTP.
 * @throws AuthTokenConfigException - Thrown when the token provider config is invalid.
 **/
export async function setUpTOTP(): Promise<SetUpTOTPOutput> {
	const authConfig = Amplify.getConfig().Auth?.Cognito;
	assertTokenProviderConfig(authConfig);
	const { tokens } = await fetchAuthSession({ forceRefresh: false });
	assertAuthTokens(tokens);
	const username = tokens.idToken?.payload['cognito:username'] ?? '';
	const { SecretCode } = await associateSoftwareToken(
		{
			region: getRegion(authConfig.userPoolId),
			userAgentValue: getAuthUserAgentValue(AuthAction.SetUpTOTP),
		},
		{
			AccessToken: tokens.accessToken.toString(),
		},
	);

	if (!SecretCode) {
		// This should never happen.
		throw new AuthError({
			name: SETUP_TOTP_EXCEPTION,
			message: 'Failed to set up TOTP.',
		});
	}

	return getTOTPSetupDetails(SecretCode, JSON.stringify(username));
}
