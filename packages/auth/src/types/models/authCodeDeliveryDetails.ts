import { AuthUserAttributeKey } from '.';


export type AuthCodeDeliveryDetails<UserAttributeKey extends AuthUserAttributeKey> = {
	destination: string;
	deliveryMedium: DeliveryMedium;
	attributeName?: UserAttributeKey;
}

export const enum DeliveryMedium {
	EMAIL = 'EMAIL',
	SMS = 'SMS',
	UNKNOWN = 'UNKNOWN'
}