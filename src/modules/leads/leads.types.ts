export type CreateLeadInput = {
  name: string;
  email: string;
  phone: string;
  focus: string;
  interests: string[];
  acceptedTermsAt: Date;
};

export type PatchLeadInput = {
  name?: string;
  email: string;
  phone?: string;
  focus?: string;
  interests?: string[];
  acceptedTermsAt?: Date;
};


export type Lead = CreateLeadInput & {
  id: string;
  createdAt: Date;
};
