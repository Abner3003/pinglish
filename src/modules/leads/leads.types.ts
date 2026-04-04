export type CreateProfessionalInput = {
  name: string;
  email: string;
  phone: string;
};

export type CreateLeadInput = {
  name: string;
  email: string;
  phone: string;
  focus: string;
  interests: string[];
  acceptedTermsAt: Date;
  professional?: CreateProfessionalInput;
};

export type CreatePortalAccessRequestInput = {
  name: string;
  email: string;
  phone: string;
  couponCode?: string | null;
  professional?: CreateProfessionalInput;
};

export type PatchLeadInput = {
  name?: string;
  email: string;
  phone?: string;
  focus?: string;
  interests?: string[];
  acceptedTermsAt?: Date;
  professional?: CreateProfessionalInput;
};


export type Lead = CreateLeadInput & {
  id: string;
  professionalId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PortalAccessRequest = CreatePortalAccessRequestInput & {
  id: string;
  professionalId?: string | null;
  couponCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
};
