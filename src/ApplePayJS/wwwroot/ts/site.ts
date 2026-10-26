// Copyright (c) Just Eat, 2016. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

namespace justEat {

    /**
     * A class representing the handler for Apple Pay JS.
     */
    export class ApplePay {

        public merchantIdentifier: string;
        public storeName: string;

        private applePayVersion: number;
        private countryCode: string;
        private currencyCode: string;
        private session!: ApplePaySession;
        private validationResource: string;

        /**
         * Initializes a new instance of the justEat.ApplePay class.
         */
        public constructor() {

            // Get the merchant identifier and store display name from the page meta tags.
            this.merchantIdentifier = this.getMetaContent("apple-pay-merchant-id") ?? "";
            this.storeName = this.getMetaContent("apple-pay-store-name") ?? "";

            // Get the URL to POST to for Apple Pay merchant validation
            this.validationResource = document.querySelector<HTMLLinkElement>("link[rel='merchant-validation']")?.href ?? "";

            // Set the Apple Pay JS version to use
            this.applePayVersion = 10;

            // Set the appropriate ISO country and currency codes
            this.countryCode = this.getMetaContent("payment-country-code") || "GB";
            this.currencyCode = this.getMetaContent("payment-currency-code") || "GBP";
        }

        /**
         * Initializes the handler for the current page.
         */
        public initialize(): void {

            if (!this.merchantIdentifier) {
                this.showError("No Apple Pay merchant certificate is configured.");
            }
            // Is ApplePaySession available in the browser?
            else if (this.supportedByDevice() === true) {

                // Determine whether to display the Apple Pay button. See this link for details
                // on the two different approaches: https://developer.apple.com/documentation/applepayjs/checking_if_apple_pay_is_available
                if (this.canMakePayments() === true) {
                    this.showButton();
                }
                else {
                    this.canMakePaymentsWithActiveCard().then((canMakePayments) => {
                        if (canMakePayments === true) {
                            this.showButton();
                        }
                        else {
                            if (this.supportsSetup()) {
                                this.showSetupButton();
                            } else {
                                this.showError("Apple Pay cannot be used at this time. If using macOS you need to be paired with a device that supports at least TouchID.");
                            }
                        }
                    });
                }
            }
            else {
                this.showError("This device and/or browser does not support Apple Pay.");
            }
        }

        /**
         * Handles the Apple Pay button being pressed.
         * @param e - The event object.
         */
        private beginPayment = (e: Event): void => {

            e.preventDefault();

            // Get the amount to request from the form and set up
            // the totals and line items for collection and delivery.
            const subtotal = document.querySelector<HTMLInputElement>("#amount")?.value ?? "0";
            const delivery = "0.01";
            const deliveryTotal = (parseFloat(subtotal) + parseFloat(delivery)).toString(10);

            const totalForCollection = {
                label: this.storeName,
                amount: subtotal
            };

            const lineItemsForCollection: ApplePayJS.ApplePayLineItem[] = [
                { label: "Subtotal", amount: subtotal, type: "final" }
            ];

            const totalForDelivery = {
                label: this.storeName,
                amount: deliveryTotal
            };

            const lineItemsForDelivery: ApplePayJS.ApplePayLineItem[] = [
                { label: "Subtotal", amount: subtotal, type: "final" },
                { label: "Delivery", amount: delivery, type: "final" }
            ];

            // Create the Apple Pay payment request as appropriate.
            const paymentRequest = this.createPaymentRequest(delivery, lineItemsForDelivery, totalForDelivery);

            // Create the Apple Pay session.
            this.session = new ApplePaySession(this.applePayVersion, paymentRequest);

            // Setup handler for validation the merchant session.
            this.session.onvalidatemerchant = this.onValidateMerchant;

            // Setup handler for shipping method selection.
            this.session.onshippingmethodselected = (event) => {

                let newTotal: ApplePayJS.ApplePayLineItem;
                let newLineItems: ApplePayJS.ApplePayLineItem[];

                // Swap the total and line items based on the selected shipping method
                if (event.shippingMethod.identifier === "collection") {
                    newTotal = totalForCollection;
                    newLineItems = lineItemsForCollection;
                }
                else {
                    newTotal = totalForDelivery;
                    newLineItems = lineItemsForDelivery;
                }

                const update = {
                    newTotal: newTotal,
                    newLineItems: newLineItems
                };

                this.session.completeShippingMethodSelection(update);
            };

            // Setup handler to receive the token when payment is authorized.
            this.session.onpaymentauthorized = this.onPaymentAuthorized;

            // Begin the session to display the Apple Pay sheet.
            this.session.begin();
        }

        /**
         * Captures funds from the specified payment token.
         * @param token - The authorized Apple Pay payment token.
         * @returns The authorization result to return to complete the payment.
         */
        private captureFunds(token: ApplePayJS.ApplePayPaymentToken): ApplePayJS.ApplePayPaymentAuthorizationResult {

            // Do something with the payment to capture funds and
            // then dismiss the Apple Pay sheet for the session with
            // the relevant status code for the payment's authorization.
            // If any errors occurred, add them to the errors array for display.
            return {
                status: ApplePaySession.STATUS_SUCCESS,
                errors: []
            };
        }

        /**
         * Indicates whether or not the device supports Apple Pay.
         * @returns true if the device supports making payments with Apple Pay; otherwise, false.
         */
        private canMakePayments(): boolean {
            return ApplePaySession.canMakePayments();
        }

        /**
         * Indicates whether or not the device supports Apple Pay and if the user has an active card in Wallet.
         * @returns true if the device supports Apple Pay and there is at least one active card in Wallet; otherwise, false.
         */
        private canMakePaymentsWithActiveCard(): Promise<boolean> {
            return ApplePaySession.canMakePaymentsWithActiveCard(this.merchantIdentifier);
        }

        /**
         * Creates an Apple Pay payment request for the specified total and line items.
         * @param deliveryAmount - The amount to charge for delivery.
         * @param lineItems - The line items for the payment.
         * @param total - The total for the payment.
         * @returns The Apple Pay payment request that was created.
         */
        private createPaymentRequest = (deliveryAmount: string, lineItems: ApplePayJS.ApplePayLineItem[], total: ApplePayJS.ApplePayLineItem): ApplePayJS.ApplePayPaymentRequest => {
            const paymentRequest: ApplePayJS.ApplePayPaymentRequest = {
                applicationData: btoa("Custom application-specific data"),
                countryCode: this.countryCode,
                currencyCode: this.currencyCode,
                merchantCapabilities: ["supports3DS", "supportsCredit", "supportsDebit"],
                supportedNetworks: ["amex", "discover", "jcb", "masterCard", "privateLabel", "visa"],
                lineItems: lineItems,
                total: total,
                requiredBillingContactFields: ["email", "name", "phone", "postalAddress"],
                requiredShippingContactFields: ["email", "name", "phone", "postalAddress"],
                shippingType: "delivery",
                shippingMethods: [
                    { label: "Delivery", amount: deliveryAmount, identifier: "delivery", detail: "Delivery to you" },
                    { label: "Collection", amount: "0.00", identifier: "collection", detail: "Collect from the store" }
                ],
                supportedCountries: [this.countryCode]
            };

            // You can optionally pre-populate the billing and shipping contact
            // with information about the current user, if available to you.
            // paymentRequest.billingContact = {
            //     givenName: "",
            //     familyName: ""
            // };
            // paymentRequest.shippingContact = {
            //     givenName: "",
            //     familyName: ""
            // };

            return paymentRequest;
        }

        /**
         * Gets the content of the specified meta tag in the current page.
         * @param name - The name of the meta tag.
         * @returns The content of the meta tag, if found.
         */
        private getMetaContent(name: string): string | undefined {
            return document.querySelector<HTMLMetaElement>(`meta[name='${name}']`)?.content;
        }

        /**
         * Gets the current page's language.
         * @returns The current page language.
         */
        private getPageLanguage(): string {
            return document.documentElement.lang || "en";
        }

        /**
         * Hides the setup button.
         */
        private hideSetupButton(): void {
            const button = document.querySelector("#set-up-apple-pay-button");
            if (button) {
                button.classList.add("d-none");
                button.removeEventListener("click", this.setupApplePay);
            }
        }

        /**
         * Handles the Apple Pay payment being authorized by the user.
         * @param event - The event object.
         */
        private onPaymentAuthorized = (event: ApplePayJS.ApplePayPaymentAuthorizedEvent): void => {

            // Get the payment data for use to capture funds from
            // the encrypted Apple Pay token in your server.
            const token = event.payment.token;

            // Process the payment
            const authorizationResult = this.captureFunds(token);

            if (authorizationResult.status === ApplePaySession.STATUS_SUCCESS) {

                // Get the contact details for use, for example to
                // use to create an account for the user.
                const billingContact = event.payment.billingContact;
                const shippingContact = event.payment.shippingContact;

                // Apply the details captured from the Apple Pay sheet to the page.
                const cardName = document.querySelector(".card-name");
                if (cardName) {
                    cardName.textContent = event.payment.token.paymentMethod.displayName;
                }

                this.updatePanel(document.querySelector("#billing-contact"), billingContact);
                this.updatePanel(document.querySelector("#shipping-contact"), shippingContact);
                this.showSuccess();
            }
            else {
                const errors = authorizationResult.errors ?? [];
                const messages = errors.map((error) => {
                    return error.message;
                });
                this.showError(`Your payment could not be processed. ${messages.join(" ")}`);
                errors.forEach((error) => {
                    console.error(`${error.message} (${error.contactField}: ${error.code}).`);
                });
            }

            this.session.completePayment(authorizationResult);
        }

        /**
         * Handles merchant validation for the Apple Pay session.
         * @param event - The event object.
         */
        private onValidateMerchant = (event: ApplePayJS.ApplePayValidateMerchantEvent): void => {

            // Create the payload.
            const data = {
                validationUrl: event.validationURL
            };

            const headers = this.createValidationHeaders();
            const request = this.createValidationRequest(data, headers);

            // Post the payload to the server to validate the
            // merchant session using the merchant certificate.
            fetch(this.validationResource, request)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Merchant validation failed with HTTP status ${response.status}.`);
                    }
                    return response.json();
                })
                .then((merchantSession) => {
                    // Complete validation by passing the merchant session to the Apple Pay session.
                    this.session.completeMerchantValidation(merchantSession);
                });
        }

        /**
         * Creates the HTTP headers to use for the validation request.
         * @returns An object representing the HTTP headers for the request.
         */
        private createValidationHeaders(): Record<string, string> {

            // Set any custom HTTP request headers here.
            const headers: Record<string, string> = {
                "Content-Type": "application/json; charset=utf-8"
            };

            // Setup antiforgery HTTP header.
            const antiforgeryHeader = this.getMetaContent("x-antiforgery-name");
            const antiforgeryToken = this.getMetaContent("x-antiforgery-token");

            if (antiforgeryHeader && antiforgeryToken) {
                headers[antiforgeryHeader] = antiforgeryToken;
            }

            return headers;
        }

        /**
         * Creates the validation request to use for the HTTP POST to the server.
         * @param data - The request data.
         * @param headers - The request headers.
         */
        private createValidationRequest = (data: object, headers: HeadersInit): RequestInit => {
            return {
                method: "POST",
                body: JSON.stringify(data),
                headers: headers
            };
        }

        /**
         * Event handler for setting up Apple Pay.
         */
        private setupApplePay = (): Promise<boolean> => {
            return ApplePaySession.openPaymentSetup(this.merchantIdentifier)
                .then((success) => {
                    if (success) {
                        this.hideSetupButton();
                        this.showButton();
                    }
                    else {
                        this.showError("Failed to set up Apple Pay.");
                    }
                    return success;
                }).catch((err: unknown) => {
                    this.showError(`Failed to set up Apple Pay. ${JSON.stringify(err)}`);
                    return false;
                });
        }

        /**
         * Shows the Apple Pay button.
         */
        private showButton = (): void => {

            const button = document.querySelector<HTMLElement>("#apple-pay-button");

            if (!button) {
                return;
            }

            button.lang = this.getPageLanguage();
            button.addEventListener("click", this.beginPayment);

            if (this.supportsSetup()) {
                button.classList.add("apple-pay-button-with-text", "apple-pay-button-black-with-text");
            }
            else {
                button.classList.add("apple-pay-button", "apple-pay-button-black");
            }

            button.classList.remove("d-none");
        }

        /**
         * Shows the error banner.
         * @param text - The text to show in the banner.
         */
        private showError(text: string): void {
            const error = document.querySelector(".apple-pay-error");
            if (error) {
                error.textContent = text;
                error.classList.remove("d-none");
            }
        }

        /**
         * Shows the button to set up Apple Pay.
         */
        private showSetupButton = (): void => {
            const button = document.querySelector<HTMLElement>("#set-up-apple-pay-button");
            if (button) {
                button.lang = this.getPageLanguage();
                button.addEventListener("click", this.setupApplePay);
                button.classList.remove("d-none");
            }
        }

        /**
         * Shows the successful payment button.
         */
        private showSuccess() {
            document.querySelector(".apple-pay-intro")?.classList.add("d-none");
            document.querySelector(".apple-pay-success")?.classList.remove("d-none");
        }

        /**
         * Returns whether Apple Pay is supported on the current device.
         * @returns Whether Apple Pay is supported.
         */
        private supportedByDevice(): boolean {
            return "ApplePaySession" in window && ApplePaySession !== undefined;
        }

        /**
         * Returns whether setting up Apple Pay is supported on the current device.
         * @returns Whether setting up Apple Pay is supported.
         */
        private supportsSetup(): boolean {
            return "openPaymentSetup" in ApplePaySession;
        }

        /**
         * Updates the specified panel with the specified Apple Pay contact.
         * @param panel - The panel to update.
         * @param contact - The contact to update the panel with the details for.
         */
        private updatePanel = (panel: Element | null, contact: ApplePayJS.ApplePayPaymentContact | undefined) => {

            if (!panel || !contact) {
                return;
            }

            if (contact.emailAddress) {
                this.showContactLine(panel, ".contact-email", contact.emailAddress, `mailto:${contact.emailAddress}`);
            }

            if (contact.phoneNumber) {
                this.showContactLine(panel, ".contact-telephone", contact.phoneNumber, `tel:${contact.phoneNumber}`);
            }

            if (contact.givenName) {
                this.showContactLine(panel, ".contact-name", `${contact.givenName} ${contact.familyName}`);
            }

            if (contact.addressLines) {
                this.setText(panel, ".contact-address-lines", contact.addressLines.join(", "));
                this.setText(panel, ".contact-sub-locality", contact.subLocality);
                this.setText(panel, ".contact-locality", contact.locality);
                this.setText(panel, ".contact-sub-administrative-area", contact.subAdministrativeArea);
                this.setText(panel, ".contact-administrative-area", contact.administrativeArea);
                this.setText(panel, ".contact-postal-code", contact.postalCode);
                this.setText(panel, ".contact-country", contact.country);
                panel.querySelector(".contact-address")?.classList.remove("d-none");
            }
        }

        /**
         * Sets the text of the specified element within a panel.
         * @param panel - The panel containing the element.
         * @param selector - The selector for the element.
         * @param text - The text to set.
         */
        private setText(panel: Element, selector: string, text: string | undefined): void {
            const element = panel.querySelector(selector);
            if (element) {
                element.textContent = text ?? "";
            }
        }

        /**
         * Shows a line of contact details within a panel.
         * @param panel - The panel containing the element.
         * @param selector - The selector for the element.
         * @param text - The text to display.
         * @param href - The optional URL to link the element to.
         */
        private showContactLine(panel: Element, selector: string, text: string, href?: string): void {
            const element = panel.querySelector(selector);
            if (element) {
                element.textContent = text;
                if (href) {
                    element.setAttribute("href", href);
                }
                element.append(document.createElement("br"));
                element.classList.remove("d-none");
            }
        }
    }
}

(() => {
    const handler = new justEat.ApplePay();
    handler.initialize();
})();
