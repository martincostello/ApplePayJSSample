// Copyright (c) Just Eat, 2016. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

const justEat = {
    applePay: {
        // Function to handle payment when the Apple Pay button is clicked/pressed.
        beginPayment: (e) => {

            e.preventDefault();

            // Get the amount to request from the form and set up
            // the totals and line items for collection and delivery.
            const subtotal = document.querySelector("#amount").value;
            const delivery = "0.01";
            const deliveryTotal = (Number(subtotal) + Number(delivery)).toString();

            const countryCode = justEat.applePay.getMetaContent("payment-country-code") || "GB";
            const currencyCode = justEat.applePay.getMetaContent("payment-currency-code") || "GBP";
            const storeName = justEat.applePay.getMetaContent("apple-pay-store-name");

            const totalForCollection = {
                label: storeName,
                amount: subtotal
            };

            const lineItemsForCollection = [
                { label: "Subtotal", amount: subtotal, type: "final" }
            ];

            const totalForDelivery = {
                label: storeName,
                amount: deliveryTotal
            };

            const lineItemsForDelivery = [
                { label: "Subtotal", amount: subtotal, type: "final" },
                { label: "Delivery", amount: delivery, type: "final" }
            ];

            // Create the Apple Pay payment request as appropriate.
            const paymentRequest = {
                applicationData: btoa("Custom application-specific data"),
                countryCode: countryCode,
                currencyCode: currencyCode,
                merchantCapabilities: [ "supports3DS" ],
                supportedNetworks: [ "amex", "masterCard", "visa" ],
                lineItems: lineItemsForDelivery,
                total: totalForDelivery,
                requiredBillingContactFields: [ "email", "name", "phone", "postalAddress" ],
                requiredShippingContactFields: [ "email", "name", "phone", "postalAddress" ],
                shippingType: "delivery",
                shippingMethods: [
                    { label: "Delivery", amount: delivery, identifier: "delivery", detail: "Delivery to you" },
                    { label: "Collection", amount: "0.00", identifier: "collection", detail: "Collect from the store" }
                ],
                supportedCountries: [countryCode]
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

            // Create the Apple Pay session.
            const session = new ApplePaySession(10, paymentRequest);

            // Setup handler for validation the merchant session.
            session.onvalidatemerchant = (event) => {

                // Create the payload.
                const data = {
                    validationUrl: event.validationURL
                };

                // Setup antiforgery HTTP header.
                const antiforgeryHeader = justEat.applePay.getMetaContent("x-antiforgery-name");
                const antiforgeryToken = justEat.applePay.getMetaContent("x-antiforgery-token");

                const headers = {
                    "Content-Type": "application/json; charset=utf-8"
                };
                headers[antiforgeryHeader] = antiforgeryToken;

                // Post the payload to the server to validate the
                // merchant session using the merchant certificate.
                fetch(document.querySelector("link[rel='merchant-validation']").href, {
                    method: "POST",
                    body: JSON.stringify(data),
                    headers: headers
                }).then((response) => {
                    if (!response.ok) {
                        throw new Error(`Merchant validation failed with HTTP status ${response.status}.`);
                    }
                    return response.json();
                }).then((merchantSession) => {
                    // Complete validation by passing the merchant session to the Apple Pay session.
                    session.completeMerchantValidation(merchantSession);
                });
            };

            // Setup handler for shipping method selection.
            session.onshippingmethodselected = (event) => {

                let newTotal;
                let newLineItems;

                if (event.shippingMethod.identifier === "collection") {
                    newTotal = totalForCollection;
                    newLineItems = lineItemsForCollection;
                } else {
                    newTotal = totalForDelivery;
                    newLineItems = lineItemsForDelivery;
                }

                const update = {
                    newTotal: newTotal,
                    newLineItems: newLineItems
                };

                session.completeShippingMethodSelection(update);
            };

            // Setup handler to receive the token when payment is authorized.
            session.onpaymentauthorized = (event) => {

                // Get the contact details for use, for example to
                // use to create an account for the user.
                const billingContact = event.payment.billingContact;
                const shippingContact = event.payment.shippingContact;

                // Get the payment data for use to capture funds from
                // the encrypted Apple Pay token in your server.
                const token = event.payment.token.paymentData;

                // Apply the details from the Apple Pay sheet to the page.
                const update = (panel, contact) => {

                    const showLine = (selector, text, href) => {
                        const element = panel.querySelector(selector);
                        element.textContent = text;
                        if (href) {
                            element.setAttribute("href", href);
                        }
                        element.append(document.createElement("br"));
                        element.classList.remove("d-none");
                    };

                    const setText = (selector, text) => {
                        panel.querySelector(selector).textContent = text ?? "";
                    };

                    if (contact.emailAddress) {
                        showLine(".contact-email", contact.emailAddress, `mailto:${contact.emailAddress}`);
                    }

                    if (contact.phoneNumber) {
                        showLine(".contact-telephone", contact.phoneNumber, `tel:${contact.phoneNumber}`);
                    }

                    if (contact.givenName) {
                        showLine(".contact-name", `${contact.givenName} ${contact.familyName}`);
                    }

                    if (contact.addressLines) {
                        setText(".contact-address-lines", contact.addressLines.join(", "));
                        setText(".contact-sub-locality", contact.subLocality);
                        setText(".contact-locality", contact.locality);
                        setText(".contact-sub-administrative-area", contact.subAdministrativeArea);
                        setText(".contact-administrative-area", contact.administrativeArea);
                        setText(".contact-postal-code", contact.postalCode);
                        setText(".contact-country", contact.country);
                        panel.querySelector(".contact-address").classList.remove("d-none");
                    }
                };

                document.querySelector(".card-name").textContent = event.payment.token.paymentMethod.displayName;
                update(document.querySelector("#billing-contact"), billingContact);
                update(document.querySelector("#shipping-contact"), shippingContact);

                const authorizationResult = {
                    status: ApplePaySession.STATUS_SUCCESS,
                    errors: []
                };

                // Do something with the payment to capture funds and
                // then dismiss the Apple Pay sheet for the session with
                // the relevant status code for the payment's authorization.
                session.completePayment(authorizationResult);

                justEat.applePay.showSuccess();
            };

            // Start the session to display the Apple Pay sheet.
            session.begin();
        },
        setupApplePay: () => {
            const merchantIdentifier = justEat.applePay.getMerchantIdentifier();
            ApplePaySession.openPaymentSetup(merchantIdentifier)
                .then((success) => {
                    if (success) {
                        justEat.applePay.hideSetupButton();
                        justEat.applePay.showButton();
                    } else {
                        justEat.applePay.showError("Failed to set up Apple Pay.");
                    }
                }).catch((e) => {
                    justEat.applePay.showError(`Failed to set up Apple Pay. ${e}`);
                });
        },
        showButton: () => {
            const button = document.querySelector("#apple-pay-button");
            button.lang = justEat.applePay.getPageLanguage();
            button.addEventListener("click", justEat.applePay.beginPayment);

            if (justEat.applePay.supportsSetup()) {
                button.classList.add("apple-pay-button-with-text", "apple-pay-button-black-with-text");
            } else {
                button.classList.add("apple-pay-button", "apple-pay-button-black");
            }

            button.classList.remove("d-none");
        },
        showSetupButton: () => {
            const button = document.querySelector("#set-up-apple-pay-button");
            button.lang = justEat.applePay.getPageLanguage();
            button.addEventListener("click", justEat.applePay.setupApplePay);
            button.classList.remove("d-none");
        },
        hideSetupButton: () => {
            const button = document.querySelector("#set-up-apple-pay-button");
            button.classList.add("d-none");
            button.removeEventListener("click", justEat.applePay.setupApplePay);
        },
        showError: (text) => {
            const error = document.querySelector(".apple-pay-error");
            error.textContent = text;
            error.classList.remove("d-none");
        },
        showSuccess: () => {
            document.querySelector(".apple-pay-intro").classList.add("d-none");
            document.querySelector(".apple-pay-success").classList.remove("d-none");
        },
        supportedByDevice: () => {
            return "ApplePaySession" in window;
        },
        supportsSetup: () => {
            return "openPaymentSetup" in ApplePaySession;
        },
        getPageLanguage: () => {
            return document.documentElement.lang || "en";
        },
        getMerchantIdentifier: () => {
            return justEat.applePay.getMetaContent("apple-pay-merchant-id");
        },
        getMetaContent: (name) => {
            return document.querySelector(`meta[name='${name}']`)?.content;
        }
    }
};

(() => {

    // Get the merchant identifier from the page meta tags.
    const merchantIdentifier = justEat.applePay.getMerchantIdentifier();

    if (!merchantIdentifier) {
        justEat.applePay.showError("No Apple Pay merchant certificate is configured.");
    }
    // Is ApplePaySession available in the browser?
    else if (justEat.applePay.supportedByDevice()) {

        // Determine whether to display the Apple Pay button. See this link for details
        // on the two different approaches: https://developer.apple.com/documentation/applepayjs/checking_if_apple_pay_is_available
        if (ApplePaySession.canMakePayments() === true) {
            justEat.applePay.showButton();
        } else {
            ApplePaySession.canMakePaymentsWithActiveCard(merchantIdentifier).then((canMakePayments) => {
                if (canMakePayments === true) {
                    justEat.applePay.showButton();
                } else {
                    if (justEat.applePay.supportsSetup()) {
                        justEat.applePay.showSetupButton();
                    } else {
                        justEat.applePay.showError("Apple Pay cannot be used at this time. If using macOS you need to be paired with a device that supports at least TouchID.");
                    }
                }
            });
        }
    } else {
        justEat.applePay.showError("This device and/or browser does not support Apple Pay.");
    }
})();
