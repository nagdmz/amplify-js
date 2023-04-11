// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SignUpCommandOutput } from '@aws-sdk/client-cognito-identity-provider';
import { signUp } from '../../../src/providers/cognito';
import { AuthSignUpStep } from '../../../src/types';
import * as signUpClient from '../../../src/providers/cognito/utils/clients/SignUpClient';
import { authAPITestParams } from './testUtils/authApiTestParams';
import { AuthValidationErrorCode } from '../../../src/errors/types/validation';
import { AuthError } from '../../../src/errors/AuthError';
import { SignUpException } from '../../../src/providers/cognito/types/errors/service';
import { AmplifyErrorString } from '@aws-amplify/core';

describe('SignUp API Happy Path Cases:', () => {
	let signUpSpy;
	const { user1 } = authAPITestParams;
	beforeEach(() => {
		signUpSpy = jest
			.spyOn(signUpClient, 'signUpClient')
			.mockImplementation(async (params: signUpClient.SignUpClientInput) => {
				return {
					UserConfirmed: false,
					UserSub: '1234567890',
					CodeDeliveryDetails: {
						AttributeName: 'email',
						DeliveryMedium: 'EMAIL',
						Destination: user1.email,
					},
				} as SignUpCommandOutput;
			});
	});
	afterEach(() => {
		signUpSpy.mockClear();
	});
	test('SignUp API should call the UserPoolClient and should return a SignUpResult', async () => {
		const result = await signUp({
			username: user1.username,
			password: user1.password,
			options: {
				userAttributes: [{ userAttributeKey: 'email', value: user1.email }],
			},
		});
		expect(result).toEqual({
			isSignUpComplete: false,
			nextStep: {
				signUpStep: AuthSignUpStep.CONFIRM_SIGN_UP,
				codeDeliveryDetails: {
					destination: user1.email,
					deliveryMedium: 'EMAIL',
					attributeName: 'email',
				},
			},
		});
		expect(signUpSpy).toHaveBeenCalledWith({
			ClientMetadata: undefined,
			Password: user1.password,
			UserAttributes: [{ Name: 'email', Value: user1.email }],
			Username: user1.username,
			ValidationData: undefined,
		});
		expect(signUpSpy).toBeCalledTimes(1);
	});
});

describe('SignUp API Error Path Cases:', () => {
	const { user1 } = authAPITestParams;

	test('SignUp API should throw a validation AuthError when username is empty', async () => {
		try {
			await signUp({ username: '', password: user1.password });
		} catch (error) {
			expect(error).toBeInstanceOf(AuthError);
			expect(error.name).toBe(AuthValidationErrorCode.EmptySignUpUsername);
		}
	});

	test('SignUp API should throw a validation AuthError when password is empty', async () => {
		try {
			await signUp({ username: user1.username, password: '' });
		} catch (error) {
			expect(error).toBeInstanceOf(AuthError);
			expect(error.name).toBe(AuthValidationErrorCode.EmptySignUpPassword);
		}
	});

	test('SignUp API should expect a service error', async () => {
		const serviceError = new Error('service error');
		serviceError.name = SignUpException.InvalidParameterException;

		jest
			.spyOn(signUpClient, 'signUpClient')
			.mockImplementation(() => Promise.reject(serviceError));

		try {
			await signUp({ username: user1.username, password: user1.password });
		} catch (error) {
			expect(error).toBeInstanceOf(AuthError);
			expect(error.name).toBe(SignUpException.InvalidParameterException);
		}
	});

	test('SignUp API should expect an unknown error when underlying error is not coming from the service', async () => {
		const unknownError = new Error('unknown error');

		jest
			.spyOn(signUpClient, 'signUpClient')
			.mockImplementation(() => Promise.reject(unknownError));

		try {
			await signUp({ username: user1.username, password: user1.password });
		} catch (error) {
			expect(error).toBeInstanceOf(AuthError);
			expect(error.name).toBe(AmplifyErrorString.UNKNOWN);
			expect(error.underlyingError).toBeInstanceOf(Error);
		}
	});

	test('SignUp API should expect an unknown error when the underlying error is null', async () => {
		const unknownError = null;

		jest
			.spyOn(signUpClient, 'signUpClient')
			.mockImplementation(() => Promise.reject(unknownError));

		try {
			await signUp({ username: user1.username, password: user1.password });
		} catch (error) {
			expect(error).toBeInstanceOf(AuthError);
			expect(error.name).toBe(AmplifyErrorString.UNKNOWN);
			expect(error.underlyingError).toBe(null);
		}
	});
});

describe('SignUp API Edge Cases:', () => {});